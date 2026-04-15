use crate::ai::config::{AiConfig, ProviderType};
use crate::ai::InferenceRequest;
use serde::{Deserialize, Serialize};

/// Prompt complexity assessment result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Complexity {
    /// Short text (<200 chars), classify, tag, detect tasks.
    Simple,
    /// Medium text (200-1000 chars), summarize, rewrite tasks.
    Medium,
    /// Long text (>1000 chars), translate, detailed summary, multi-step reasoning.
    Complex,
}

/// Routing decision produced by ComplexityRouter.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingDecision {
    /// Chosen provider for this request.
    pub provider: ProviderType,
    /// Assessed complexity level.
    pub complexity: Complexity,
    /// Human-readable reason for the routing choice.
    pub reason: String,
}

/// Heuristic-based router that assesses prompt complexity and selects
/// the best provider based on task characteristics and provider availability.
///
/// Routing strategy:
/// - Simple tasks (short text, classify/tag keywords) -> local (fast, private)
/// - Complex tasks (long text, translate/summarize keywords) -> cloud (more capable)
/// - Medium tasks -> cloud if available, else local
/// - Falls back to whichever provider is available when only one exists
pub struct ComplexityRouter;

impl ComplexityRouter {
    /// Analyze an InferenceRequest and return a routing decision.
    pub fn route(request: &InferenceRequest, config: &AiConfig) -> RoutingDecision {
        let complexity = Self::assess_complexity(request);

        let local_available = Self::is_local_available(config);
        let cloud_available = Self::is_cloud_available(config);

        match (&complexity, local_available, cloud_available) {
            // Simple task, local available -> local
            (Complexity::Simple, true, _) => RoutingDecision {
                provider: ProviderType::Local,
                complexity,
                reason: "简单任务，路由到本地 provider".to_string(),
            },
            // Medium task, only local available -> local
            (Complexity::Medium, true, false) => RoutingDecision {
                provider: ProviderType::Local,
                complexity,
                reason: "中等任务，云端不可用，路由到本地 provider".to_string(),
            },
            // Medium task, cloud available -> cloud for better quality
            (Complexity::Medium, _, true) => RoutingDecision {
                provider: ProviderType::OpenAi,
                complexity,
                reason: "中等任务，路由到云端以获得更高质量".to_string(),
            },
            // Complex task, cloud available -> cloud
            (Complexity::Complex, _, true) => RoutingDecision {
                provider: ProviderType::OpenAi,
                complexity,
                reason: "复杂任务，路由到云端 provider".to_string(),
            },
            // Any complexity, only local available -> local
            (_, true, false) => RoutingDecision {
                provider: ProviderType::Local,
                complexity,
                reason: "仅本地 provider 可用".to_string(),
            },
            // Any complexity, only cloud available -> cloud
            (_, false, true) => RoutingDecision {
                provider: ProviderType::OpenAi,
                complexity,
                reason: "仅云端 provider 可用".to_string(),
            },
            // No provider available -> default to local (will error at infer time)
            (_, false, false) => RoutingDecision {
                provider: ProviderType::Local,
                complexity,
                reason: "无可用的 provider，将使用本地（请在推理前配置 provider）".to_string(),
            },
        }
    }

    /// Assess prompt complexity based on length and keyword analysis.
    fn assess_complexity(request: &InferenceRequest) -> Complexity {
        let prompt = &request.prompt;
        let prompt_len = prompt.chars().count();

        // Combine prompt and system_prompt for keyword analysis
        let sys = request.system_prompt.as_deref().unwrap_or("");

        // Simple task keywords: classify, tag, detect, categorize, label
        let simple_keywords = [
            "classify",
            "tag",
            "detect",
            "categorize",
            "label",
            "identify",
            "分类",
            "标签",
            "检测",
        ];
        // Complex task keywords: translate, summarize, explain, rewrite, format, detailed
        let complex_keywords = [
            "translate",
            "summarize",
            "explain",
            "rewrite",
            "format",
            "detailed",
            "翻译",
            "总结",
            "改写",
            "详细",
        ];

        let prompt_lower = prompt.to_lowercase();
        let sys_lower = sys.to_lowercase();
        let combined = format!("{} {}", prompt_lower, sys_lower);

        // Keyword-based assessment takes priority
        if simple_keywords.iter().any(|k| combined.contains(k)) && prompt_len < 500 {
            Complexity::Simple
        } else if complex_keywords.iter().any(|k| combined.contains(k)) || prompt_len > 1000 {
            Complexity::Complex
        } else if prompt_len < 200 {
            Complexity::Simple
        } else {
            Complexity::Medium
        }
    }

    /// Check if local provider is configured (has a model path).
    fn is_local_available(config: &AiConfig) -> bool {
        config.model_path.is_some()
    }

    /// Check if any cloud provider is configured (has API key).
    fn is_cloud_available(config: &AiConfig) -> bool {
        config.openai_api_key.is_some() || config.anthropic_api_key.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_request(prompt: &str, system_prompt: Option<&str>) -> InferenceRequest {
        InferenceRequest {
            prompt: prompt.to_string(),
            system_prompt: system_prompt.map(String::from),
            max_tokens: None,
            temperature: None,
            top_p: None,
        }
    }

    fn config_with_local() -> AiConfig {
        AiConfig {
            active_provider: ProviderType::Auto,
            model_path: Some("/path/to/model.gguf".to_string()),
            ..AiConfig::default()
        }
    }

    fn config_with_cloud() -> AiConfig {
        AiConfig {
            active_provider: ProviderType::Auto,
            openai_api_key: Some("sk-test".to_string()),
            ..AiConfig::default()
        }
    }

    fn config_with_both() -> AiConfig {
        AiConfig {
            active_provider: ProviderType::Auto,
            model_path: Some("/path/to/model.gguf".to_string()),
            openai_api_key: Some("sk-test".to_string()),
            ..AiConfig::default()
        }
    }

    fn config_with_none() -> AiConfig {
        AiConfig {
            active_provider: ProviderType::Auto,
            ..AiConfig::default()
        }
    }

    #[test]
    fn test_simple_short_text_routes_local() {
        let req = make_request("Hello", None);
        let decision = ComplexityRouter::route(&req, &config_with_both());
        assert_eq!(decision.provider, ProviderType::Local);
        assert_eq!(decision.complexity, Complexity::Simple);
    }

    #[test]
    fn test_classify_keyword_routes_simple() {
        let req = make_request("classify this text into categories", None);
        let decision = ComplexityRouter::route(&req, &config_with_both());
        assert_eq!(decision.complexity, Complexity::Simple);
        assert_eq!(decision.provider, ProviderType::Local);
    }

    #[test]
    fn test_translate_keyword_routes_complex() {
        let req = make_request("translate this text to English", None);
        let decision = ComplexityRouter::route(&req, &config_with_both());
        assert_eq!(decision.complexity, Complexity::Complex);
        assert_eq!(decision.provider, ProviderType::OpenAi);
    }

    #[test]
    fn test_long_text_routes_complex() {
        let long_text = "a".repeat(1001);
        let req = make_request(&long_text, None);
        let decision = ComplexityRouter::route(&req, &config_with_both());
        assert_eq!(decision.complexity, Complexity::Complex);
        assert_eq!(decision.provider, ProviderType::OpenAi);
    }

    #[test]
    fn test_medium_text_local_only() {
        let medium_text = "a".repeat(500);
        let req = make_request(&medium_text, None);
        let decision = ComplexityRouter::route(&req, &config_with_local());
        assert_eq!(decision.complexity, Complexity::Medium);
        assert_eq!(decision.provider, ProviderType::Local);
    }

    #[test]
    fn test_medium_text_with_cloud() {
        let medium_text = "a".repeat(500);
        let req = make_request(&medium_text, None);
        let decision = ComplexityRouter::route(&req, &config_with_cloud());
        assert_eq!(decision.complexity, Complexity::Medium);
        assert_eq!(decision.provider, ProviderType::OpenAi);
    }

    #[test]
    fn test_no_provider_available() {
        let req = make_request("test", None);
        let decision = ComplexityRouter::route(&req, &config_with_none());
        assert_eq!(decision.provider, ProviderType::Local);
    }

    #[test]
    fn test_chinese_keywords() {
        let req = make_request("帮我分类这段文字", None);
        let decision = ComplexityRouter::route(&req, &config_with_both());
        assert_eq!(decision.complexity, Complexity::Simple);
    }

    #[test]
    fn test_system_prompt_influences_routing() {
        let req = make_request("some text", Some("summarize the following content"));
        let decision = ComplexityRouter::route(&req, &config_with_both());
        assert_eq!(decision.complexity, Complexity::Complex);
    }
}
