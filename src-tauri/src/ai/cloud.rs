use crate::ai::{InferenceProvider, InferenceRequest, InferenceResponse};

/// Maximum number of retries for transient errors.
const MAX_RETRIES: u32 = 2;

/// Base delay in milliseconds for exponential backoff.
const BASE_DELAY_MS: u64 = 1000;

/// Perform a request with retry logic for transient errors (429, 5xx, network).
async fn request_with_retry<F, Fut>(mut attempt_fn: F) -> Result<reqwest::Response, String>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<reqwest::Response, String>>,
{
    let mut last_error = String::new();
    for attempt in 0..=MAX_RETRIES {
        let result = attempt_fn().await;
        match result {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    return Ok(response);
                }
                // Only retry on 429 and 5xx
                let should_retry = status.as_u16() == 429 || status.is_server_error();
                let body_text = response.text().await.unwrap_or_default();
                if !should_retry || attempt >= MAX_RETRIES {
                    return Err(format!("API error ({}): {}", status, body_text));
                }
                last_error = format!("API error ({}): {}", status, body_text);
                let delay = BASE_DELAY_MS * (1 << attempt); // 1s, 2s
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
            }
            Err(e) => {
                let should_retry = e.contains("timed out") || e.contains("connect") || e.contains("connection");
                if !should_retry || attempt >= MAX_RETRIES {
                    return Err(e);
                }
                last_error = e;
                let delay = BASE_DELAY_MS * (1 << attempt);
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
            }
        }
    }
    Err(format!("All retries failed. Last error: {}", last_error))
}

/// OpenAI-compatible API inference provider.
pub struct OpenAiProvider {
    client: reqwest::Client,
    api_key: Option<String>,
    endpoint: String,
    model: String,
}

impl OpenAiProvider {
    pub fn new(api_key: Option<String>, endpoint: String, model: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            endpoint,
            model,
        }
    }
}

#[async_trait::async_trait]
impl InferenceProvider for OpenAiProvider {
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, String> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| "OpenAI API key not configured".to_string())?;

        let start = std::time::Instant::now();

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
            "model": self.model,
            "messages": messages,
            "max_tokens": request.max_tokens.unwrap_or(512),
            "temperature": request.temperature.unwrap_or(0.7),
            "top_p": request.top_p.unwrap_or(0.9),
        });

        let url = format!("{}/chat/completions", self.endpoint.trim_end_matches('/'));
        let client = &self.client;

        let response = request_with_retry(|| {
            let client = client.clone();
            let url = url.clone();
            let api_key = api_key.clone();
            let body = body.clone();
            async move {
                client
                    .post(&url)
                    .header("Authorization", format!("Bearer {}", api_key))
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("OpenAI request failed: {}", e))
            }
        })
        .await?;

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

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
            provider: "openai".to_string(),
            duration_ms,
        })
    }

    fn name(&self) -> &str {
        "openai"
    }

    fn is_available(&self) -> bool {
        self.api_key.is_some()
    }
}

/// Anthropic Claude API inference provider.
pub struct AnthropicProvider {
    client: reqwest::Client,
    api_key: Option<String>,
    model: String,
}

impl AnthropicProvider {
    pub fn new(api_key: Option<String>, model: String) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model,
        }
    }
}

#[async_trait::async_trait]
impl InferenceProvider for AnthropicProvider {
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, String> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| "Anthropic API key not configured".to_string())?;

        let start = std::time::Instant::now();

        let mut body = serde_json::json!({
            "model": self.model,
            "max_tokens": request.max_tokens.unwrap_or(512),
            "messages": [
                {
                    "role": "user",
                    "content": request.prompt
                }
            ]
        });

        if let Some(ref sys) = request.system_prompt {
            body["system"] = serde_json::json!(sys);
        }

        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }

        if let Some(top_p) = request.top_p {
            body["top_p"] = serde_json::json!(top_p);
        }

        let client = &self.client;

        let response = request_with_retry(|| {
            let client = client.clone();
            let api_key = api_key.clone();
            let body = body.clone();
            async move {
                client
                    .post("https://api.anthropic.com/v1/messages")
                    .header("x-api-key", &api_key)
                    .header("anthropic-version", "2023-06-01")
                    .header("content-type", "application/json")
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Anthropic request failed: {}", e))
            }
        })
        .await?;

        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;

        let text = json["content"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let tokens_used = json["usage"]["input_tokens"]
            .as_u64()
            .unwrap_or(0) as u32
            + json["usage"]["output_tokens"]
                .as_u64()
                .unwrap_or(0) as u32;

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(InferenceResponse {
            text,
            tokens_used,
            provider: "anthropic".to_string(),
            duration_ms,
        })
    }

    fn name(&self) -> &str {
        "anthropic"
    }

    fn is_available(&self) -> bool {
        self.api_key.is_some()
    }
}

/// List available models from an OpenAI-compatible API endpoint.
pub async fn list_openai_models(
    api_key: &str,
    endpoint: &str,
) -> Result<Vec<String>, String> {
    let url = format!("{}/models", endpoint.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API error ({}): {}", status, body));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    let models = json["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(models)
}

/// Perform streaming inference with an OpenAI-compatible API.
/// Emits incremental text chunks via the provided callback.
pub async fn infer_openai_stream<F>(
    client: &reqwest::Client,
    api_key: &str,
    endpoint: &str,
    model: &str,
    request: InferenceRequest,
    mut on_chunk: F,
) -> Result<InferenceResponse, String>
where
    F: FnMut(&str, bool),
{
    let start = std::time::Instant::now();
    let mut messages = Vec::new();

    if let Some(ref sys) = request.system_prompt {
        messages.push(serde_json::json!({ "role": "system", "content": sys }));
    }
    messages.push(serde_json::json!({ "role": "user", "content": request.prompt }));

    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "max_tokens": request.max_tokens.unwrap_or(512),
        "temperature": request.temperature.unwrap_or(0.7),
        "stream": true,
    });

    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Stream request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API error ({}): {}", status, body));
    }

    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut full_text = String::new();
    let mut tokens_used: u32 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream read error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                on_chunk("", true);
                break;
            }

            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = json["choices"][0]["delta"]["content"].as_str() {
                    full_text.push_str(delta);
                    on_chunk(delta, false);
                }
                // Track usage if present in final chunk
                if let Some(usage) = json.get("usage") {
                    tokens_used = usage["total_tokens"].as_u64().unwrap_or(0) as u32;
                }
            }
        }
    }

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(InferenceResponse {
        text: full_text,
        tokens_used,
        provider: "openai".to_string(),
        duration_ms,
    })
}
