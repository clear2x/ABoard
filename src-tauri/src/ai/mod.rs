pub mod cloud;
pub mod config;
pub mod local;
pub mod models;

use config::{AiConfig, ProviderType};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

/// Maximum prompt length to prevent memory exhaustion (T-04-01 mitigation).
const MAX_PROMPT_LEN: usize = 100 * 1024; // 100KB

/// Inference timeout in seconds (T-04-04 mitigation).
const INFERENCE_TIMEOUT_SECS: u64 = 60;

/// Unified trait for all AI inference backends.
#[async_trait::async_trait]
pub trait InferenceProvider: Send + Sync {
    /// Perform inference with the given request, returning the response text and metadata.
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, String>;
    /// Return the provider name (e.g. "local", "openai", "anthropic").
    fn name(&self) -> &str;
    /// Check if this provider is available (e.g. has model loaded or API key configured).
    fn is_available(&self) -> bool;
}

/// Request payload for AI inference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceRequest {
    pub prompt: String,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub top_p: Option<f32>,
}

/// Response from AI inference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceResponse {
    pub text: String,
    pub tokens_used: u32,
    pub provider: String,
    pub duration_ms: u64,
}

/// Model metadata for listing available models.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

/// Tauri-managed state holding the active inference provider and configuration.
pub struct AiState {
    pub provider: Arc<Mutex<Box<dyn InferenceProvider>>>,
    pub config: Arc<Mutex<AiConfig>>,
    pub app_handle: tauri::AppHandle,
}

/// Initialize the AI subsystem and register it as Tauri state.
pub fn init_ai(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let config = AiConfig::load(app)?;

    let provider: Box<dyn InferenceProvider> = match config.active_provider {
        ProviderType::Local => {
            let local = if let Some(ref model_path) = config.model_path {
                local::LocalProvider::new(model_path.clone())
            } else {
                local::LocalProvider::new(String::new())
            };
            Box::new(local)
        }
        ProviderType::OpenAi => {
            let p = cloud::OpenAiProvider::new(
                config.openai_api_key.clone(),
                config.openai_endpoint.clone(),
                config.openai_model.clone(),
            );
            Box::new(p)
        }
        ProviderType::Anthropic => {
            let p = cloud::AnthropicProvider::new(
                config.anthropic_api_key.clone(),
                config.anthropic_model.clone(),
            );
            Box::new(p)
        }
    };

    app.manage(AiState {
        provider: Arc::new(Mutex::new(provider)),
        config: Arc::new(Mutex::new(config)),
        app_handle: app.clone(),
    });

    Ok(())
}

/// Perform AI inference using the currently active provider.
#[tauri::command]
pub async fn ai_infer(
    state: tauri::State<'_, AiState>,
    request: InferenceRequest,
) -> Result<InferenceResponse, String> {
    // Validate prompt length (T-04-01 mitigation)
    if request.prompt.len() > MAX_PROMPT_LEN {
        return Err(format!(
            "Prompt too long (max {} bytes)",
            MAX_PROMPT_LEN
        ));
    }

    let provider = state.provider.lock().await;
    if !provider.is_available() {
        return Err(format!(
            "Provider '{}' is not available. Please configure it first.",
            provider.name()
        ));
    }

    // Execute with timeout (T-04-04 mitigation)
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(INFERENCE_TIMEOUT_SECS),
        provider.infer(request),
    )
    .await
    .map_err(|_| {
        format!(
            "Inference timed out after {} seconds",
            INFERENCE_TIMEOUT_SECS
        )
    })?;

    result
}

/// List available GGUF models from the models directory.
#[tauri::command]
pub async fn ai_list_models(
    state: tauri::State<'_, AiState>,
) -> Result<Vec<ModelInfo>, String> {
    let app_data_dir = state
        .app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let models_dir = app_data_dir.join("models");
    if !models_dir.exists() {
        std::fs::create_dir_all(&models_dir)
            .map_err(|e| format!("Failed to create models dir: {}", e))?;
        return Ok(vec![]);
    }

    let mut models = Vec::new();
    let entries = std::fs::read_dir(&models_dir)
        .map_err(|e| format!("Failed to read models dir: {}", e))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if ext == "gguf" {
                let metadata = entry
                    .metadata()
                    .map_err(|e| format!("Failed to read model metadata: {}", e))?;
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                models.push(ModelInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    size_bytes: metadata.len(),
                });
            }
        }
    }

    Ok(models)
}

/// Switch the active AI provider.
#[tauri::command]
pub async fn ai_set_provider(
    state: tauri::State<'_, AiState>,
    provider_type: ProviderType,
    config_updates: Option<AiConfig>,
) -> Result<(), String> {
    // Update config if provided
    if let Some(updates) = config_updates {
        let mut config = state.config.lock().await;
        config.active_provider = provider_type.clone();
        if updates.model_path.is_some() {
            config.model_path = updates.model_path;
        }
        if updates.openai_api_key.is_some() {
            config.openai_api_key = updates.openai_api_key;
        }
        if updates.openai_endpoint != config.openai_endpoint {
            config.openai_endpoint = updates.openai_endpoint;
        }
        if updates.openai_model != config.openai_model {
            config.openai_model = updates.openai_model;
        }
        if updates.anthropic_api_key.is_some() {
            config.anthropic_api_key = updates.anthropic_api_key;
        }
        if updates.anthropic_model != config.anthropic_model {
            config.anthropic_model = updates.anthropic_model;
        }
        config
            .save(&state.app_handle)
            .map_err(|e| format!("Failed to save config: {}", e))?;
    } else {
        let mut config = state.config.lock().await;
        config.active_provider = provider_type.clone();
        config
            .save(&state.app_handle)
            .map_err(|e| format!("Failed to save config: {}", e))?;
    }

    // Create new provider based on the selected type
    let config = state.config.lock().await;
    let new_provider: Box<dyn InferenceProvider> = match provider_type {
        ProviderType::Local => {
            let local = if let Some(ref model_path) = config.model_path {
                local::LocalProvider::new(model_path.clone())
            } else {
                local::LocalProvider::new(String::new())
            };
            Box::new(local)
        }
        ProviderType::OpenAi => {
            let p = cloud::OpenAiProvider::new(
                config.openai_api_key.clone(),
                config.openai_endpoint.clone(),
                config.openai_model.clone(),
            );
            Box::new(p)
        }
        ProviderType::Anthropic => {
            let p = cloud::AnthropicProvider::new(
                config.anthropic_api_key.clone(),
                config.anthropic_model.clone(),
            );
            Box::new(p)
        }
    };
    drop(config);

    let mut provider = state.provider.lock().await;
    *provider = new_provider;

    Ok(())
}
