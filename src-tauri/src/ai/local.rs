use crate::ai::{InferenceProvider, InferenceRequest, InferenceResponse};

/// Local inference provider using llama.cpp.
///
/// NOTE: The llama-cpp-rs native library binding requires system-level dependencies
/// that may not be available during initial development. This implementation uses
/// a stub pattern until the native library can be properly linked.
pub struct LocalProvider {
    model_path: String,
}

impl LocalProvider {
    /// Create a new local provider. If model_path is empty, the provider
    /// will report as unavailable until a model is loaded via ai_set_provider.
    pub fn new(model_path: String) -> Self {
        Self { model_path }
    }
}

#[async_trait::async_trait]
impl InferenceProvider for LocalProvider {
    async fn infer(&self, request: InferenceRequest) -> Result<InferenceResponse, String> {
        if self.model_path.is_empty() {
            return Err("No model path configured. Please set a model path first.".to_string());
        }

        let start = std::time::Instant::now();

        // Stub implementation: llama.cpp native library not yet linked.
        // This will be replaced with actual llama-cpp-rs inference once
        // the native dependency is properly set up.
        let _ = request; // suppress unused warning

        let duration_ms = start.elapsed().as_millis() as u64;

        Err(format!(
            "Local model loading not yet available - requires llama.cpp native library (elapsed: {}ms)",
            duration_ms
        ))
    }

    fn name(&self) -> &str {
        "local"
    }

    fn is_available(&self) -> bool {
        // Stub: not available until llama.cpp is linked
        false
    }
}
