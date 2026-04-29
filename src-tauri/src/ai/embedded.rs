use crate::ai::{InferenceProvider, InferenceRequest, InferenceResponse};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Instant;

/// Default GGUF model download URL (Qwen2.5-0.5B-Instruct Q4_0, ~400MB)
/// Note: candle quantized_qwen2 only supports Q4_0 for 0.5B models, NOT Q4_K_M
const DEFAULT_MODEL_URL: &str = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_0.gguf";
const DEFAULT_MODEL_FILENAME: &str = "qwen2.5-0.5b-instruct-q4_0.gguf";
const DEFAULT_TOKENIZER_URL: &str = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/resolve/main/tokenizer.json";
const TOKENIZER_FILENAME: &str = "tokenizer.json";

/// Qwen2 chat template constants
const IM_START: &str = "<|im_start|>";
const IM_END: &str = "<|im_end|>";

/// Maximum tokens to generate for clipboard operations
const MAX_GEN_TOKENS: u32 = 256;

/// Embedded model state behind a mutex for thread-safe access.
struct EmbeddedModel {
    model: candle_transformers::models::quantized_qwen2::ModelWeights,
    tokenizer: tokenizers::Tokenizer,
    device: candle_core::Device,
    eos_token_id: u32,
}

/// Embedded inference provider using candle to load GGUF models directly.
///
/// Falls back to embedded model when no external Ollama/llama.cpp is running.
/// Loads Qwen2.5-0.5B Q4_K_M (~400MB) from the models/ directory.
pub struct EmbeddedProvider {
    model_path: PathBuf,
    tokenizer_path: PathBuf,
    model: Arc<Mutex<Option<EmbeddedModel>>>,
    loaded: AtomicBool,
    loading: AtomicBool,
}

impl EmbeddedProvider {
    pub fn new(model_path: PathBuf) -> Self {
        let tokenizer_path = model_path.parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join(TOKENIZER_FILENAME);
        Self {
            model_path,
            tokenizer_path,
            model: Arc::new(Mutex::new(None)),
            loaded: AtomicBool::new(false),
            loading: AtomicBool::new(false),
        }
    }

    /// Load model and tokenizer.
    /// Returns true if loading succeeded.
    pub async fn load_model(&self) -> Result<(), String> {
        // Prevent concurrent loading
        if self.loaded.load(Ordering::Relaxed) {
            return Ok(());
        }
        if self.loading.swap(true, Ordering::Relaxed) {
            return Err("Model is already being loaded".to_string());
        }

        let path = self.model_path.clone();
        let tok_path = self.tokenizer_path.clone();
        let result = tokio::task::spawn_blocking(move || -> Result<EmbeddedModel, String> {
            let device = candle_core::Device::Cpu;

            let mut file = std::fs::File::open(&path)
                .map_err(|e| format!("Failed to open GGUF file {:?}: {}", path, e))?;

            let content = candle_core::quantized::gguf_file::Content::read(&mut file)
                .map_err(|e| format!("Failed to parse GGUF file: {}", e))?;

            // Load tokenizer from file
            let tokenizer = tokenizers::Tokenizer::from_file(&tok_path)
                .map_err(|e| format!("Failed to load tokenizer from {:?}: {}", tok_path, e))?;

            // Load quantized model weights
            let model = candle_transformers::models::quantized_qwen2::ModelWeights::from_gguf(
                content, &mut file, &device
            ).map_err(|e| format!("Failed to load model weights: {}", e))?;

            // Find EOS token id
            let eos_token_id = tokenizer
                .get_vocab(true)
                .get(IM_END)
                .copied()
                .unwrap_or(151645); // Default Qwen2.5 EOS token id

            Ok(EmbeddedModel {
                model,
                tokenizer,
                device,
                eos_token_id,
            })
        })
        .await
        .map_err(|e| format!("Model loading task failed: {}", e))??;

        {
            let mut guard = self.model.lock().await;
            *guard = Some(result);
        }
        self.loaded.store(true, Ordering::Relaxed);
        self.loading.store(false, Ordering::Relaxed);
        Ok(())
    }

    /// Format prompt using Qwen2 chat template.
    /// Truncates long system prompts to reduce token overhead.
    fn format_prompt(system: Option<&str>, user: &str) -> String {
        let mut prompt = String::new();
        if let Some(sys) = system {
            // Truncate system prompt to 200 chars to reduce token overhead
            let truncated = if sys.len() > 200 { &sys[..200] } else { sys };
            prompt.push_str(&format!("{}system\n{}{}\n", IM_START, truncated, IM_END));
        }
        prompt.push_str(&format!("{}user\n{}{}\n{}assistant\n", IM_START, user, IM_END, IM_START));
        prompt
    }

    /// Check if the default model file exists in the models directory.
    /// Only returns Q4_0 variant (Q4_K_M is incompatible with candle quantized_qwen2 for 0.5B).
    pub fn default_model_exists(models_dir: &std::path::Path) -> Option<PathBuf> {
        let default_path = models_dir.join(DEFAULT_MODEL_FILENAME);
        if default_path.exists() {
            return Some(default_path);
        }
        // Check for any Q4_0 .gguf file (skip Q4_K_M which is incompatible)
        if let Ok(entries) = std::fs::read_dir(models_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "gguf") {
                    let name = path.file_name().unwrap_or_default().to_string_lossy();
                    if name.contains("q4_0") || name.contains("q4_0.") {
                        return Some(path);
                    }
                }
            }
        }
        None
    }

    /// Download the default model and tokenizer from HuggingFace.
    pub async fn download_default_model(
        models_dir: &std::path::Path,
    ) -> Result<PathBuf, String> {
        let target_path = models_dir.join(DEFAULT_MODEL_FILENAME);
        std::fs::create_dir_all(models_dir)
            .map_err(|e| format!("Failed to create models dir: {}", e))?;

        // Download tokenizer first (small file)
        let tokenizer_path = models_dir.join(TOKENIZER_FILENAME);
        if !tokenizer_path.exists() {
            let client = reqwest::Client::new();
            let resp = client.get(DEFAULT_TOKENIZER_URL)
                .send().await
                .map_err(|e| format!("Tokenizer download failed: {}", e))?;
            if resp.status().is_success() {
                let bytes = resp.bytes().await
                    .map_err(|e| format!("Tokenizer read failed: {}", e))?;
                std::fs::write(&tokenizer_path, &bytes)
                    .map_err(|e| format!("Tokenizer write failed: {}", e))?;
            }
        }

        // Download model GGUF if not exists
        if !target_path.exists() {
            let client = reqwest::Client::new();
            let response = client.get(DEFAULT_MODEL_URL)
                .send().await
                .map_err(|e| format!("Model download request failed: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("Model download failed with status: {}", response.status()));
            }

            let mut file = std::fs::File::create(&target_path)
                .map_err(|e| format!("Failed to create file: {}", e))?;

            use futures_util::StreamExt;
            use std::io::Write;
            let mut stream = response.bytes_stream();

            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
                file.write_all(&chunk)
                    .map_err(|e| format!("Failed to write file: {}", e))?;
            }
        }

        Ok(target_path)
    }

}

#[async_trait::async_trait]
impl InferenceProvider for EmbeddedProvider {
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, String> {
        // Lazy load on first inference call
        if !self.loaded.load(Ordering::Relaxed) {
            self.load_model().await?;
        }

        let model_arc = self.model.clone();
        let eos_token_id = {
            let guard = model_arc.lock().await;
            guard.as_ref().map(|m| m.eos_token_id).unwrap_or(151645)
        };

        let prompt = Self::format_prompt(
            request.system_prompt.as_deref(),
            &request.prompt,
        );
        let max_tokens = request.max_tokens.unwrap_or(MAX_GEN_TOKENS);
        let temperature = request.temperature.unwrap_or(0.3) as f64;

        let result = tokio::task::spawn_blocking(move || -> Result<(String, u32, u64), String> {
            let mut guard = model_arc.blocking_lock();
            let embedded = guard.as_mut().ok_or("Model not loaded")?;

            let start = Instant::now();

            // Tokenize
            let encoding = embedded.tokenizer.encode(prompt.as_str(), true)
                .map_err(|e| format!("Tokenization failed: {}", e))?;
            let mut tokens = encoding.get_ids().to_vec();

            // Create logits processor
            let sampling = if temperature <= 0.0 {
                candle_transformers::generation::Sampling::ArgMax
            } else {
                candle_transformers::generation::Sampling::All { temperature }
            };
            let mut logits_processor = candle_transformers::generation::LogitsProcessor::from_sampling(
                42u64, sampling,
            );

            // Prefill: process all input tokens
            let input = candle_core::Tensor::new(tokens.as_slice(), &embedded.device)
                .map_err(|e| format!("Tensor creation failed: {}", e))?
                .unsqueeze(0)
                .map_err(|e| format!("Unsqueeze failed: {}", e))?;

            let logits = embedded.model.forward(&input, 0)
                .map_err(|e| format!("Forward pass failed: {}", e))?
                .squeeze(0)
                .map_err(|e| format!("Squeeze failed: {}", e))?;

            let mut next_token = logits_processor.sample(&logits)
                .map_err(|e| format!("Sampling failed: {}", e))?;
            tokens.push(next_token);

            // Autoregressive generation
            let input_len = tokens.len();
            for index in 0..max_tokens {
                let input = candle_core::Tensor::new(&[next_token], &embedded.device)
                    .map_err(|e| format!("Token tensor failed: {}", e))?
                    .unsqueeze(0)
                    .map_err(|e| format!("Unsqueeze failed: {}", e))?;

                let logits = embedded.model.forward(&input, input_len + index as usize)
                    .map_err(|e| format!("Forward pass failed: {}", e))?
                    .squeeze(0)
                    .map_err(|e| format!("Squeeze failed: {}", e))?;

                next_token = logits_processor.sample(&logits)
                    .map_err(|e| format!("Sampling failed: {}", e))?;
                tokens.push(next_token);

                if next_token == eos_token_id {
                    break;
                }
            }

            // Decode only the generated tokens (skip input)
            let generated_tokens = &tokens[input_len - 1..];
            let output = embedded.tokenizer.decode(generated_tokens, true)
                .map_err(|e| format!("Decoding failed: {}", e))?;

            let duration_ms = start.elapsed().as_millis() as u64;
            let gen_count = generated_tokens.len() as u32;

            Ok((output, gen_count, duration_ms))
        })
        .await
        .map_err(|e| format!("Inference task failed: {}", e))??;

        Ok(InferenceResponse {
            text: result.0,
            tokens_used: result.1,
            provider: "embedded-candle".to_string(),
            duration_ms: result.2,
        })
    }

    fn name(&self) -> &str {
        "embedded"
    }

    fn is_available(&self) -> bool {
        self.loaded.load(Ordering::Relaxed) || self.model_path.exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_prompt_user_only() {
        let prompt = EmbeddedProvider::format_prompt(None, "Hello");
        assert!(prompt.contains("<|im_start|>user\nHello<|im_end|>"));
        assert!(prompt.contains("<|im_start|>assistant"));
        assert!(!prompt.contains("<|im_start|>system"));
    }

    #[test]
    fn test_format_prompt_with_system() {
        let prompt = EmbeddedProvider::format_prompt(Some("You are helpful"), "Hello");
        assert!(prompt.contains("<|im_start|>system\nYou are helpful<|im_end|>"));
        assert!(prompt.contains("<|im_start|>user\nHello<|im_end|>"));
    }

    #[test]
    fn test_format_prompt_truncates_long_system() {
        let long_system = "x".repeat(300);
        let prompt = EmbeddedProvider::format_prompt(Some(&long_system), "Hello");
        // System prompt should be truncated to 200 chars
        let system_part = prompt.split("<|im_end|>").next().unwrap();
        // The system content between tags should be 200 chars
        let content_start = system_part.find("system\n").unwrap() + 7;
        let system_content = &system_part[content_start..];
        assert_eq!(system_content.len(), 200);
    }

    #[test]
    fn test_format_prompt_short_system_not_truncated() {
        let short_system = "Be concise";
        let prompt = EmbeddedProvider::format_prompt(Some(short_system), "Hello");
        assert!(prompt.contains(&format!("system\n{}<|im_end|>", short_system)));
    }

    #[test]
    fn test_default_model_exists_no_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let result = EmbeddedProvider::default_model_exists(tmp.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_default_model_exists_with_file() {
        let tmp = tempfile::tempdir().unwrap();
        let model_path = tmp.path().join(DEFAULT_MODEL_FILENAME);
        std::fs::write(&model_path, b"fake model").unwrap();
        let result = EmbeddedProvider::default_model_exists(tmp.path());
        assert!(result.is_some());
        assert_eq!(result.unwrap(), model_path);
    }

    #[test]
    fn test_default_model_exists_with_q4_0_file() {
        let tmp = tempfile::tempdir().unwrap();
        let model_path = tmp.path().join("my-q4_0-model.gguf");
        std::fs::write(&model_path, b"fake").unwrap();
        let result = EmbeddedProvider::default_model_exists(tmp.path());
        assert!(result.is_some());
        assert_eq!(result.unwrap().file_name().unwrap(), "my-q4_0-model.gguf");
    }

    #[test]
    fn test_default_model_exists_ignores_non_q4_0() {
        let tmp = tempfile::tempdir().unwrap();
        let model_path = tmp.path().join("model-q4_k_m.gguf");
        std::fs::write(&model_path, b"fake").unwrap();
        let result = EmbeddedProvider::default_model_exists(tmp.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_provider_name() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("test.gguf");
        let provider = EmbeddedProvider::new(path);
        assert_eq!(provider.name(), "embedded");
    }

    #[test]
    fn test_new_provider_not_loaded() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("test.gguf");
        let provider = EmbeddedProvider::new(path);
        assert!(!provider.loaded.load(Ordering::Relaxed));
        assert!(!provider.loading.load(Ordering::Relaxed));
    }

    #[test]
    fn test_tokenizer_path_derived_from_model_path() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("models").join("test.gguf");
        let provider = EmbeddedProvider::new(path);
        assert_eq!(provider.tokenizer_path, tmp.path().join("models").join("tokenizer.json"));
    }
}
