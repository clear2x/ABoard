use crate::ai::{InferenceProvider, InferenceRequest, InferenceResponse};

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

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error ({}): {}", status, body));
        }

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

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Anthropic API error ({}): {}", status, body));
        }

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
