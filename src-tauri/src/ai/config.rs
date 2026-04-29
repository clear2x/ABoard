use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Supported AI provider types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ProviderType {
    Local,
    OpenAi,
    Anthropic,
    Auto,
}

/// AI configuration persisted to ai-config.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub active_provider: ProviderType,

    // Local provider settings
    pub model_path: Option<String>,
    pub context_length: u32,
    pub temperature: f32,
    pub top_p: f32,

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
            temperature: 0.7,
            top_p: 0.9,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = AiConfig::default();
        assert_eq!(config.active_provider, ProviderType::Local);
        assert_eq!(config.context_length, 2048);
        assert!((config.temperature - 0.7).abs() < f32::EPSILON);
        assert!((config.top_p - 0.9).abs() < f32::EPSILON);
        assert!(config.model_path.is_none());
        assert!(config.openai_api_key.is_none());
        assert_eq!(config.openai_endpoint, "https://api.openai.com/v1");
        assert_eq!(config.openai_model, "gpt-4o-mini");
        assert!(config.anthropic_api_key.is_none());
        assert_eq!(config.anthropic_model, "claude-sonnet-4-20250514");
    }

    #[test]
    fn test_provider_type_serialize_camel_case() {
        let json = serde_json::to_string(&ProviderType::OpenAi).unwrap();
        assert_eq!(json, "\"openAi\"");

        let json = serde_json::to_string(&ProviderType::Anthropic).unwrap();
        assert_eq!(json, "\"anthropic\"");
    }

    #[test]
    fn test_provider_type_deserialize() {
        let pt: ProviderType = serde_json::from_str("\"local\"").unwrap();
        assert_eq!(pt, ProviderType::Local);

        let pt: ProviderType = serde_json::from_str("\"auto\"").unwrap();
        assert_eq!(pt, ProviderType::Auto);

        let pt: ProviderType = serde_json::from_str("\"openAi\"").unwrap();
        assert_eq!(pt, ProviderType::OpenAi);
    }

    #[test]
    fn test_config_roundtrip_json() {
        let config = AiConfig {
            active_provider: ProviderType::OpenAi,
            openai_api_key: Some("sk-test123".to_string()),
            openai_model: "gpt-4".to_string(),
            context_length: 4096,
            temperature: 0.5,
            ..Default::default()
        };

        let json = serde_json::to_string_pretty(&config).unwrap();
        let parsed: AiConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.active_provider, ProviderType::OpenAi);
        assert_eq!(parsed.openai_api_key, Some("sk-test123".to_string()));
        assert_eq!(parsed.openai_model, "gpt-4");
        assert_eq!(parsed.context_length, 4096);
        assert!((parsed.temperature - 0.5).abs() < f32::EPSILON);
    }

    #[test]
    fn test_provider_type_equality() {
        assert_eq!(ProviderType::Local, ProviderType::Local);
        assert_ne!(ProviderType::Local, ProviderType::OpenAi);
        assert_ne!(ProviderType::OpenAi, ProviderType::Anthropic);
        assert_ne!(ProviderType::Anthropic, ProviderType::Auto);
    }
}
