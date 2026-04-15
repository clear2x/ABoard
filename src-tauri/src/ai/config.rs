use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Supported AI provider types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ProviderType {
    Local,
    OpenAi,
    Anthropic,
}

/// AI configuration persisted to ai-config.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub active_provider: ProviderType,

    // Local provider settings
    pub model_path: Option<String>,
    pub context_length: u32,

    // OpenAI compatible settings
    pub openai_api_key: Option<String>,
    pub openai_endpoint: String,
    pub openai_model: String,

    // Anthropic settings
    pub anthropic_api_key: Option<String>,
    pub anthropic_model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            active_provider: ProviderType::Local,
            model_path: None,
            context_length: 2048,
            openai_api_key: None,
            openai_endpoint: "https://api.openai.com/v1".to_string(),
            openai_model: "gpt-4o-mini".to_string(),
            anthropic_api_key: None,
            anthropic_model: "claude-sonnet-4-20250514".to_string(),
        }
    }
}

impl AiConfig {
    /// Load configuration from app_data_dir/ai-config.json.
    /// Returns default config if file does not exist.
    pub fn load(app: &tauri::AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let app_data_dir = app.path().app_data_dir()?;
        let config_path = app_data_dir.join("ai-config.json");

        if !config_path.exists() {
            return Ok(Self::default());
        }

        let content = std::fs::read_to_string(&config_path)?;
        let config: AiConfig = serde_json::from_str(&content)?;
        Ok(config)
    }

    /// Save configuration to app_data_dir/ai-config.json.
    /// API keys are stored locally; the config file is protected by OS file permissions (T-04-03).
    pub fn save(&self, app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
        let app_data_dir = app.path().app_data_dir()?;
        std::fs::create_dir_all(&app_data_dir)?;

        let config_path = app_data_dir.join("ai-config.json");
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&config_path, content)?;
        Ok(())
    }
}
