use crate::ai::{InferenceProvider, InferenceRequest, InferenceResponse};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;

/// Default Ollama API endpoint.
const DEFAULT_OLLAMA_ENDPOINT: &str = "http://localhost:11434";

/// Default llama.cpp server endpoint.
const DEFAULT_LLAMACPP_ENDPOINT: &str = "http://localhost:8080";

/// Cache duration for availability checks (30 seconds).
const AVAILABILITY_CACHE_SECS: u64 = 30;

/// Local inference provider using Ollama HTTP API or llama.cpp server.
///
/// Strategy: Use HTTP to call local inference services rather than linking
/// native C/C++ libraries. This keeps Cargo builds simple and cross-platform.
///
/// - Ollama (localhost:11434): The de-facto standard for local LLM inference,
///   provides /api/chat endpoint with OpenAI-compatible interface.
/// - llama.cpp server (localhost:8080): Provides /v1/chat/completions endpoint.
///
/// Users only need to install Ollama (one command) or start llama.cpp server.
pub struct LocalProvider {
    model_path: String,
    client: reqwest::Client,
    ollama_endpoint: String,
    llamacpp_endpoint: String,
    /// Cached availability result.
    available: AtomicBool,
    /// Timestamp of last availability check.
    last_check: Mutex<u64>,
}

impl LocalProvider {
    /// Create a new local provider. If model_path is empty, the provider
    /// will report as unavailable until a model is loaded via ai_set_provider.
    pub fn new(model_path: String) -> Self {
        Self {
            model_path,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            ollama_endpoint: DEFAULT_OLLAMA_ENDPOINT.to_string(),
            llamacpp_endpoint: DEFAULT_LLAMACPP_ENDPOINT.to_string(),
            available: AtomicBool::new(false),
            last_check: Mutex::new(0),
        }
    }

    /// Extract model name from model_path.
    /// If model_path is a file path like "/path/to/llama3.2.gguf", extract "llama3.2".
    /// If model_path is already a model name, use it as-is.
    fn resolve_model_name(&self) -> String {
        if self.model_path.is_empty() {
            return "llama3.2".to_string();
        }

        let path = std::path::Path::new(&self.model_path);
        let filename = path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| self.model_path.clone());

        // Strip .gguf extension if present
        if let Some(name) = filename.strip_suffix(".gguf") {
            name.to_string()
        } else {
            filename
        }
    }

    /// Check if Ollama is running by querying GET /api/tags.
    async fn check_ollama(&self) -> bool {
        let url = format!("{}/api/tags", self.ollama_endpoint);
        match self.client.get(&url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }

    /// Check if llama.cpp server is running by querying GET /health.
    async fn check_llamacpp(&self) -> bool {
        let url = format!("{}/health", self.llamacpp_endpoint);
        match self.client.get(&url).send().await {
            Ok(resp) => resp.status().is_success(),
            Err(_) => false,
        }
    }

    /// Perform inference via Ollama HTTP API (POST /api/chat).
    async fn infer_ollama(&self, request: &InferenceRequest) -> Result<InferenceResponse, String> {
        let start = Instant::now();
        let model_name = self.resolve_model_name();

        let mut messages = Vec::new();

        if let Some(ref sys) = request.system_prompt {
            messages.push(serde_json::json!({
                "role": "system",
                "content": sys
            }));
        }

        messages.push(serde_json::json!({
            "role": "user",
            "content": request.prompt
        }));

        let body = serde_json::json!({
            "model": model_name,
            "messages": messages,
            "stream": false,
            "options": {
                "temperature": request.temperature.unwrap_or(0.7),
                "top_p": request.top_p.unwrap_or(0.9),
                "num_predict": request.max_tokens.unwrap_or(512),
            }
        });

        let url = format!("{}/api/chat", self.ollama_endpoint);

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Ollama request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Ollama API error ({}): {}", status, body));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

        let text = json["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        // Ollama returns eval_count for tokens
        let tokens_used = json["eval_count"]
            .as_u64()
            .unwrap_or(0) as u32;

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(InferenceResponse {
            text,
            tokens_used,
            provider: "local-ollama".to_string(),
            duration_ms,
        })
    }

    /// Perform inference via llama.cpp server (POST /v1/chat/completions).
    async fn infer_llamacpp(
        &self,
        request: &InferenceRequest,
    ) -> Result<InferenceResponse, String> {
        let start = Instant::now();

        let mut messages = Vec::new();

        if let Some(ref sys) = request.system_prompt {
            messages.push(serde_json::json!({
                "role": "system",
                "content": sys
            }));
        }

        messages.push(serde_json::json!({
            "role": "user",
            "content": request.prompt
        }));

        let body = serde_json::json!({
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(512),
            "temperature": request.temperature.unwrap_or(0.7),
            "top_p": request.top_p.unwrap_or(0.9),
        });

        let url = format!("{}/v1/chat/completions", self.llamacpp_endpoint);

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("llama.cpp server request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "llama.cpp server API error ({}): {}",
                status, body
            ));
        }

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse llama.cpp server response: {}", e))?;

        let text = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let tokens_used = json["usage"]["total_tokens"]
            .as_u64()
            .unwrap_or(0) as u32;

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(InferenceResponse {
            text,
            tokens_used,
            provider: "local-llamacpp".to_string(),
            duration_ms,
        })
    }

    /// Check availability with caching to avoid probing on every call.
    async fn check_availability(&self) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Check cache validity
        {
            let last = self.last_check.lock().unwrap();
            if *last > 0 && now - *last < AVAILABILITY_CACHE_SECS {
                return self.available.load(Ordering::Relaxed);
            }
        }

        // Perform actual check
        let ollama_ok = self.check_ollama().await;
        let llamacpp_ok = if ollama_ok {
            false // No need to check llama.cpp if Ollama is available
        } else {
            self.check_llamacpp().await
        };

        let result = ollama_ok || llamacpp_ok;
        self.available.store(result, Ordering::Relaxed);

        // Update cache timestamp
        {
            let mut last = self.last_check.lock().unwrap();
            *last = now;
        }

        result
    }

    /// Force an async availability check and update the cache.
    /// Called by ai_detect_local_provider command.
    pub async fn detect_availability(&self) -> bool {
        self.check_availability().await
    }

    /// Detect Ollama availability and retrieve installed models.
    pub async fn detect_ollama_models(&self) -> Vec<String> {
        let url = format!("{}/api/tags", self.ollama_endpoint);
        match self.client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<serde_json::Value>().await {
                    Ok(json) => {
                        json["models"]
                            .as_array()
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|m| m["name"].as_str().map(String::from))
                                    .collect()
                            })
                            .unwrap_or_default()
                    }
                    Err(_) => vec![],
                }
            }
            _ => vec![],
        }
    }
}

#[async_trait::async_trait]
impl InferenceProvider for LocalProvider {
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, String> {
        if self.model_path.is_empty() {
            return Err(
                "No model configured. Please select a model in the Model Manager first."
                    .to_string(),
            );
        }

        // Try Ollama first (preferred)
        if self.check_ollama().await {
            return self.infer_ollama(&request).await;
        }

        // Fall back to llama.cpp server
        if self.check_llamacpp().await {
            return self.infer_llamacpp(&request).await;
        }

        // Neither service is available
        Err(
            "No local inference service found. Install Ollama from https://ollama.com or start llama.cpp server."
                .to_string(),
        )
    }

    fn name(&self) -> &str {
        "local"
    }

    fn is_available(&self) -> bool {
        // Synchronous check using cached value.
        // The cache is populated by async check_availability() called by ai_detect_local_provider.
        // On first call before any async check, falls through to refresh.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        {
            let last = self.last_check.lock().unwrap();
            if *last > 0 && now - *last < AVAILABILITY_CACHE_SECS {
                return self.available.load(Ordering::Relaxed);
            }
        }

        // Cache expired or not populated - return false.
        // The async ai_detect_local_provider command will populate the cache.
        // During infer(), the actual async check is performed.
        self.available.load(Ordering::Relaxed)
    }
}
