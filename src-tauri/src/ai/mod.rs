pub mod cloud;
pub mod config;
pub mod embedded;
pub mod local;
pub mod models;
pub mod processor;
pub mod router;

use config::{AiConfig, ProviderType};
use models::{ModelInfo, ModelManager};
use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Manager;
use tauri::Emitter;
use tokio::sync::Mutex;

/// Maximum prompt length to prevent memory exhaustion (T-04-01 mitigation).
const MAX_PROMPT_LEN: usize = 100 * 1024; // 100KB

/// Inference timeout in seconds (T-04-04 mitigation).
const INFERENCE_TIMEOUT_SECS: u64 = 60;

/// Maximum model file size: 5GB (T-04-06 mitigation).
const MAX_MODEL_FILE_SIZE: u64 = 5 * 1024 * 1024 * 1024;

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

/// Response from auto-routed AI inference, includes routing decision metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceAutoResponse {
    pub response: InferenceResponse,
    pub routing_decision: Option<router::RoutingDecision>,
}

/// Status of local inference services (Ollama / llama.cpp server).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalProviderStatus {
    pub ollama_available: bool,
    pub llamacpp_available: bool,
    pub detected_models: Vec<String>,
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

    let app_data_dir = app.path().app_data_dir()?;
    let models_dir = app_data_dir.join("models");

    // Try embedded model first as default
    let embedded_path = embedded::EmbeddedProvider::default_model_exists(&models_dir);

    let provider: Box<dyn InferenceProvider> = if embedded_path.is_some() {
        // Use embedded candle model if GGUF file exists
        Box::new(embedded::EmbeddedProvider::new(embedded_path.unwrap()))
    } else {
        match config.active_provider {
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
            ProviderType::Auto => {
                let local = if let Some(ref model_path) = config.model_path {
                    local::LocalProvider::new(model_path.clone())
                } else {
                    local::LocalProvider::new(String::new())
                };
                Box::new(local)
            }
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

/// List all registered models from the database, with filesystem scanning for auto-discovery.
#[tauri::command]
pub async fn ai_list_models(
    state: tauri::State<'_, AiState>,
    db_state: tauri::State<'_, DbState>,
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

    let active_model_path = {
        let config = state.config.lock().await;
        config.model_path.clone()
    };

    // Scan directory and cross-validate with database
    ModelManager::scan_models_dir(&db_state.conn, &models_dir, active_model_path.as_deref())
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
        config.temperature = updates.temperature;
        config.top_p = updates.top_p;
        config.context_length = updates.context_length;
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
        ProviderType::Auto => {
            let local = if let Some(ref model_path) = config.model_path {
                local::LocalProvider::new(model_path.clone())
            } else {
                local::LocalProvider::new(String::new())
            };
            Box::new(local)
        }
    };
    drop(config);

    let mut provider = state.provider.lock().await;
    *provider = new_provider;

    Ok(())
}

/// Download a GGUF model from a URL to the local models directory.
/// Sends progress events to the frontend during download.
#[tauri::command]
pub async fn ai_download_model(
    state: tauri::State<'_, AiState>,
    db_state: tauri::State<'_, DbState>,
    url: String,
    name: String,
) -> Result<ModelInfo, String> {
    // Validate URL is HTTPS (T-04-05 mitigation)
    if !url.starts_with("https://") {
        return Err("Only HTTPS URLs are allowed for model downloads".to_string());
    }

    // Validate name
    let sanitized_name = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .collect::<String>();
    if sanitized_name.is_empty() {
        return Err("Invalid model name".to_string());
    }

    let filename = if sanitized_name.ends_with(".gguf") {
        sanitized_name
    } else {
        format!("{}.gguf", sanitized_name)
    };

    let app_data_dir = state
        .app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let models_dir = crate::db::ensure_models_dir(&app_data_dir)
        .map_err(|e| format!("Failed to create models dir: {}", e))?;

    let file_path = models_dir.join(&filename);

    // Check if file already exists
    if file_path.exists() {
        return Err(format!("Model file '{}' already exists", filename));
    }

    // Download the file
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    // Validate Content-Type if available (T-04-05 mitigation)
    if let Some(content_type) = response.headers().get("content-type") {
        let ct = content_type.to_str().unwrap_or("").to_lowercase();
        // Allow common binary types and generic octet-stream; reject text/html
        if ct.contains("text/html") {
            return Err("Invalid content type: received HTML instead of model file".to_string());
        }
    }

    let total_size = response.content_length().unwrap_or(0);

    // Check file size limit (T-04-06 mitigation)
    if total_size > MAX_MODEL_FILE_SIZE {
        return Err(format!(
            "Model file too large (max {} bytes)",
            MAX_MODEL_FILE_SIZE
        ));
    }

    // Stream download to file with progress events
    use futures_util::StreamExt;
    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    use std::io::Write;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        downloaded += chunk.len() as u64;

        // Emit progress event
        if total_size > 0 {
            let _ = state.app_handle.emit(
                "model-download-progress",
                serde_json::json!({
                    "name": &filename,
                    "downloaded": downloaded,
                    "total": total_size,
                    "percent": (downloaded as f64 / total_size as f64 * 100.0) as u32,
                }),
            );
        }
    }

    // Register the model in the database
    let registered = ModelManager::register_model(
        &db_state.conn,
        &filename,
        downloaded,
        &file_path.to_string_lossy(),
    )?;

    // Convert to ModelInfo with active status
    let active_model_path = {
        let config = state.config.lock().await;
        config.model_path.clone()
    };

    Ok(ModelInfo {
        id: registered.id,
        name: registered.name,
        filename: registered.filename,
        file_size: registered.file_size,
        status: registered.status,
        downloaded_at: registered.downloaded_at,
        is_active: Some(file_path.to_string_lossy().to_string()) == active_model_path,
        context_length: registered.context_length,
        description: registered.description,
    })
}

/// Delete a downloaded model by ID.
#[tauri::command]
pub async fn ai_delete_model(
    _state: tauri::State<'_, AiState>,
    db_state: tauri::State<'_, DbState>,
    model_id: String,
) -> Result<(), String> {
    ModelManager::delete_model(&db_state.conn, &model_id)
}

/// Get the current AI configuration.
#[tauri::command]
pub async fn ai_get_config(
    state: tauri::State<'_, AiState>,
) -> Result<AiConfig, String> {
    let config = state.config.lock().await;
    Ok(config.clone())
}

/// Update AI configuration (temperature, context_length, top_p, provider settings).
/// Changes are persisted immediately and take effect for subsequent inferences.
#[tauri::command]
pub async fn ai_set_config(
    state: tauri::State<'_, AiState>,
    config: AiConfig,
) -> Result<(), String> {
    // Persist the new config
    {
        let mut current_config = state.config.lock().await;
        *current_config = config.clone();
        current_config
            .save(&state.app_handle)
            .map_err(|e| format!("Failed to save config: {}", e))?;
    }

    // If provider type changed, switch to the new provider
    let new_provider: Box<dyn InferenceProvider> = match config.active_provider {
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
        ProviderType::Auto => {
            let local = if let Some(ref model_path) = config.model_path {
                local::LocalProvider::new(model_path.clone())
            } else {
                local::LocalProvider::new(String::new())
            };
            Box::new(local)
        }
    };

    let mut provider = state.provider.lock().await;
    *provider = new_provider;

    Ok(())
}

/// Detect local inference services (Ollama / llama.cpp server) availability.
/// Returns status of each service and any models detected from Ollama.
#[tauri::command]
pub async fn ai_detect_local_provider(
    state: tauri::State<'_, AiState>,
) -> Result<LocalProviderStatus, String> {
    // Get model_path from config for creating a detection provider.
    let model_path = {
        let config = state.config.lock().await;
        config.model_path.clone().unwrap_or_default()
    };

    // Create a temporary LocalProvider for detection.
    let detector = local::LocalProvider::new(model_path);

    // Check Ollama first
    let ollama_available = detector.detect_availability().await;

    let (ollama_available, llamacpp_available, detected_models) = if ollama_available {
        let models = detector.detect_ollama_models().await;
        (true, false, models)
    } else {
        // Check llama.cpp server separately
        let llamacpp_ok = detector.check_llamacpp_standalone().await;
        (false, llamacpp_ok, vec![])
    };

    Ok(LocalProviderStatus {
        ollama_available,
        llamacpp_available,
        detected_models,
    })
}

/// Perform AI inference with automatic provider routing.
///
/// When active_provider is Auto, uses ComplexityRouter to assess prompt complexity
/// and route to the best available provider. For other provider modes, delegates
/// directly to the configured provider.
#[tauri::command]
pub async fn ai_infer_auto(
    state: tauri::State<'_, AiState>,
    request: InferenceRequest,
) -> Result<InferenceAutoResponse, String> {
    // Validate prompt length
    if request.prompt.len() > MAX_PROMPT_LEN {
        return Err(format!(
            "Prompt too long (max {} bytes)",
            MAX_PROMPT_LEN
        ));
    }

    let config = state.config.lock().await.clone();

    // If not Auto mode, use the current provider directly
    if config.active_provider != ProviderType::Auto {
        let provider = state.provider.lock().await;
        if !provider.is_available() {
            return Err(format!(
                "Provider '{}' is not available. Please configure it first.",
                provider.name()
            ));
        }
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
        })??;

        return Ok(InferenceAutoResponse {
            response: result,
            routing_decision: None,
        });
    }

    // Auto mode: use router to decide provider
    let decision = router::ComplexityRouter::route(&request, &config);

    // Create provider based on routing decision
    let provider: Box<dyn InferenceProvider> = match decision.provider {
        ProviderType::Local => {
            let local = if let Some(ref path) = config.model_path {
                local::LocalProvider::new(path.clone())
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
        ProviderType::Auto => {
            // Should not happen -- Auto mode is handled above
            unreachable!("Auto mode should not produce Auto routing decision")
        }
    };

    if !provider.is_available() {
        return Err(format!(
            "Routed provider '{}' is not available. Reason: {}",
            provider.name(),
            decision.reason
        ));
    }

    // Execute inference with timeout
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
    })??;

    Ok(InferenceAutoResponse {
        response: result,
        routing_decision: Some(decision),
    })
}

/// Load an embedded GGUF model for local inference.
/// Auto-detects the model file in the models/ directory or uses the provided path.
#[tauri::command]
pub async fn ai_embedded_load(
    state: tauri::State<'_, AiState>,
) -> Result<String, String> {
    let app_data_dir = state
        .app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let models_dir = app_data_dir.join("models");

    // Find a GGUF file
    let model_path = embedded::EmbeddedProvider::default_model_exists(&models_dir)
        .ok_or("No GGUF model file found in models/ directory. Run ai_embedded_download first.")?;

    let provider = embedded::EmbeddedProvider::new(model_path);
    provider.load_model().await?;

    // Replace the active provider with the embedded one
    let mut guard = state.provider.lock().await;
    *guard = Box::new(provider);

    Ok("Embedded model loaded successfully".to_string())
}

/// Download the default embedded model (Qwen2.5-0.5B Q4_K_M) from HuggingFace.
#[tauri::command]
pub async fn ai_embedded_download(
    state: tauri::State<'_, AiState>,
) -> Result<String, String> {
    let app_data_dir = state
        .app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let models_dir = app_data_dir.join("models");
    let model_path = embedded::EmbeddedProvider::download_default_model(&models_dir).await?;

    Ok(format!("Model downloaded to: {}", model_path.display()))
}
