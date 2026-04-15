use crate::ai::{AiState, InferenceRequest};
use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tokio::sync::mpsc;

/// Maximum content length sent to AI for type detection (to avoid oversized prompts).
const MAX_AI_CONTENT_LEN: usize = 2000;

/// Maximum number of semantic tags to generate.
const MAX_TAGS: usize = 5;

/// Maximum length of each tag.
const MAX_TAG_LEN: usize = 50;

/// Minimum content length (in chars) to trigger summary generation.
const MIN_SUMMARY_CHARS: usize = 200;

/// Maximum content length sent to AI for summary generation.
const MAX_SUMMARY_CONTENT_LEN: usize = 2000;

/// Maximum tokens for AI summary output (T-05-06 mitigation).
const MAX_SUMMARY_TOKENS: u32 = 150;

/// Allowed content types for AI detection result (T-05-03 mitigation).
const ALLOWED_AI_TYPES: &[&str] = &["code", "link", "json", "xml", "image", "text"];

/// A job to be processed by the AI processor queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingJob {
    pub item_id: String,
    pub content: String,
    pub content_type: String,
}

/// AI processor state: holds the MPSC sender for enqueueing jobs.
pub struct AiProcessor {
    tx: mpsc::Sender<ProcessingJob>,
}

/// Channel capacity limit (T-05-02 mitigation).
const CHANNEL_CAPACITY: usize = 100;

/// Start the AI processor background loop.
/// Returns an AiProcessor that can be used to send jobs.
pub fn start_processor(app: tauri::AppHandle) -> AiProcessor {
    let (tx, mut rx) = mpsc::channel::<ProcessingJob>(CHANNEL_CAPACITY);

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(job) = rx.recv().await {
            process_job(&app_clone, &job).await;
        }
    });

    AiProcessor { tx }
}

/// Send a processing job to the background queue.
/// Returns false if the channel is full (job is dropped, T-05-02 mitigation).
pub fn enqueue(processor: &AiProcessor, job: ProcessingJob) -> bool {
    match processor.tx.try_send(job) {
        Ok(_) => true,
        Err(e) => {
            eprintln!("[ai-processor] Channel full or closed, dropping job: {}", e);
            false
        }
    }
}

/// Process a single clipboard item: detect type, generate tags, generate summary, update DB.
async fn process_job(app: &tauri::AppHandle, job: &ProcessingJob) {
    // Step 1: Detect content type (rules first, AI fallback)
    let ai_type = detect_type(app, &job.content, &job.content_type).await;

    // Step 2: Generate semantic tags
    let ai_tags = generate_tags(app, &job.content, &ai_type).await;

    // Step 3: Generate summary for long text (>200 chars)
    let ai_summary = if job.content.chars().count() > MIN_SUMMARY_CHARS {
        generate_summary(app, &job.content).await
    } else {
        None
    };

    // Step 4: Update database with all AI metadata
    let db_state = app.state::<DbState>();
    let tags_json = ai_tags.as_ref().map(|tags| {
        serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string())
    });

    if let Err(e) = update_ai_metadata_internal(
        &db_state.conn,
        &job.item_id,
        Some(ai_type.clone()),
        tags_json,
        ai_summary.clone(),
    ) {
        eprintln!("[ai-processor] Failed to update AI metadata for {}: {}", job.item_id, e);
        return;
    }

    // Step 5: Emit event to frontend (includes ai_summary)
    let payload = serde_json::json!({
        "item_id": job.item_id,
        "ai_type": ai_type,
        "ai_tags": ai_tags.unwrap_or_default(),
        "ai_summary": ai_summary,
    });
    if let Err(e) = app.emit("ai-processed", payload) {
        eprintln!("[ai-processor] Failed to emit ai-processed event: {}", e);
    }
}

/// Detect content type using rules first, then AI fallback.
async fn detect_type(app: &tauri::AppHandle, content: &str, content_type: &str) -> String {
    // Image is already detected by clipboard.rs
    if content_type == "image" {
        return "image".to_string();
    }

    // Try rule-based detection first
    if let Some(detected) = detect_type_rules(content) {
        return detected;
    }

    // AI fallback: ask the model to classify
    detect_type_ai(app, content).await
}

/// Rule-based content type detection.
/// Returns Some(type) if confident, None if uncertain.
fn detect_type_rules(content: &str) -> Option<String> {
    let trimmed = content.trim();

    // JSON detection: try to parse as JSON
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
        // Only classify as JSON if it's an object or array (not a bare string/number)
        if val.is_object() || val.is_array() {
            return Some("json".to_string());
        }
    }

    // XML detection: starts with <?xml or has matching XML-style tags
    if trimmed.starts_with("<?xml") {
        return Some("xml".to_string());
    }
    // Check for XML-like structure: starts with < and has closing tag
    if trimmed.starts_with('<') && trimmed.contains("</") && trimmed.ends_with('>') {
        // Make sure it's not HTML-like (basic heuristic)
        if !trimmed.contains("<!DOCTYPE html") && !trimmed.contains("<html") {
            return Some("xml".to_string());
        }
    }

    // Link detection: content is primarily a single URL
    let url_re = regex::Regex::new(r"^https?://\S+$").ok();
    if let Some(re) = &url_re {
        // Single line content that's a URL
        if re.is_match(trimmed) {
            return Some("link".to_string());
        }
    }

    // Multi-line where every non-empty line is a URL
    let lines: Vec<&str> = trimmed.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.len() > 1 {
        let url_line_re = regex::Regex::new(r"^https?://\S+$").ok();
        if let Some(re) = &url_line_re {
            let url_count = lines.iter().filter(|l| re.is_match(l.trim())).count();
            if url_count == lines.len() {
                return Some("link".to_string());
            }
        }
    }

    // Code detection: look for common programming patterns
    if detect_code_patterns(trimmed) {
        return Some("code".to_string());
    }

    // Could not determine with rules
    None
}

/// Detect if content looks like source code using pattern matching.
fn detect_code_patterns(content: &str) -> bool {
    let code_indicators = [
        // Function/method definitions
        regex::Regex::new(r"(?m)^\s*(fn |function |def |class |public |private |protected |static |async |const |let |var |import |from |require\(|#include |package )").ok(),
        // Braces/brackets with indentation (common in C-style languages)
        regex::Regex::new(r"(?m)^\s*\{").ok(),
        // Semicolons at end of lines (C-style)
        regex::Regex::new(r"(?m);\s*$").ok(),
        // Arrow functions or lambdas
        regex::Regex::new(r"=>|\->").ok(),
        // Type annotations
        regex::Regex::new(r":\s*(string|number|boolean|void|int|float|double|Vec|Option|Result|std::)").ok(),
    ];

    let mut match_count = 0;
    for indicator in &code_indicators {
        if let Some(re) = indicator {
            if re.is_match(content) {
                match_count += 1;
            }
        }
    }

    // Strong single-keyword indicators (def, function, fn, class) are sufficient on their own
    if match_count >= 2 {
        return true;
    }

    // Check for strong single indicators that are highly specific to code
    let strong_indicators = [
        regex::Regex::new(r"(?m)^\s*(fn |function |def |class )").ok(),
        regex::Regex::new(r"(?m)^\s*#include\s").ok(),
        regex::Regex::new(r"(?m)^\s*import\s+\w+").ok(),
        regex::Regex::new(r"(?m)^\s*from\s+\w+\s+import").ok(),
    ];

    for indicator in &strong_indicators {
        if let Some(re) = indicator {
            if re.is_match(content) {
                return true;
            }
        }
    }

    false
}

/// AI-based type detection fallback.
async fn detect_type_ai(app: &tauri::AppHandle, content: &str) -> String {
    let truncated = truncate_for_ai(content);

    let request = InferenceRequest {
        prompt: format!(
            "Analyze the following content and return ONLY one word: code, link, text, json, or xml.\n\nContent:\n{}",
            truncated
        ),
        system_prompt: Some("You are a content type classifier. Respond with exactly one word: code, link, text, json, or xml. No explanation.".to_string()),
        max_tokens: Some(10),
        temperature: Some(0.1),
        top_p: Some(0.9),
    };

    let ai_state = app.state::<AiState>();
    let provider = ai_state.provider.lock().await;

    if !provider.is_available() {
        return "text".to_string();
    }

    match tokio::time::timeout(
        std::time::Duration::from_secs(15),
        provider.infer(request),
    )
    .await
    {
        Ok(Ok(response)) => {
            let detected = response.text.trim().to_lowercase();
            // Validate against allowed types (T-05-03 mitigation)
            if ALLOWED_AI_TYPES.contains(&detected.as_str()) {
                detected
            } else {
                eprintln!("[ai-processor] AI returned invalid type '{}', defaulting to text", detected);
                "text".to_string()
            }
        }
        Ok(Err(e)) => {
            eprintln!("[ai-processor] AI type detection failed: {}, defaulting to text", e);
            "text".to_string()
        }
        Err(_) => {
            eprintln!("[ai-processor] AI type detection timed out, defaulting to text");
            "text".to_string()
        }
    }
}

/// Generate semantic tags for content using AI.
async fn generate_tags(app: &tauri::AppHandle, content: &str, ai_type: &str) -> Option<Vec<String>> {
    let truncated = truncate_for_ai(content);

    let request = InferenceRequest {
        prompt: format!(
            "Generate 3-5 semantic tags for the following {} content. Return ONLY a JSON array of lowercase strings, each tag 1-3 words. No explanation.\n\nContent:\n{}",
            ai_type, truncated
        ),
        system_prompt: Some("You are a tagging assistant. Return ONLY a JSON array of strings. Example: [\"javascript\", \"async function\", \"error handling\"]".to_string()),
        max_tokens: Some(100),
        temperature: Some(0.3),
        top_p: Some(0.9),
    };

    let ai_state = app.state::<AiState>();
    let provider = ai_state.provider.lock().await;

    if !provider.is_available() {
        return None;
    }

    match tokio::time::timeout(
        std::time::Duration::from_secs(20),
        provider.infer(request),
    )
    .await
    {
        Ok(Ok(response)) => {
            let text = response.text.trim();
            // Try to parse the response as JSON array
            parse_tags_response(text)
        }
        Ok(Err(e)) => {
            eprintln!("[ai-processor] AI tag generation failed: {}", e);
            None
        }
        Err(_) => {
            eprintln!("[ai-processor] AI tag generation timed out");
            None
        }
    }
}

/// Generate a concise 1-2 sentence summary for long text content using AI.
/// Returns None if AI is unavailable or generation fails (non-blocking).
async fn generate_summary(app: &tauri::AppHandle, content: &str) -> Option<String> {
    // Truncate content to avoid excessive token usage (T-05-06 mitigation)
    let truncated = if content.len() <= MAX_SUMMARY_CONTENT_LEN {
        content.to_string()
    } else {
        let end = content.char_indices()
            .take_while(|(idx, _)| *idx < MAX_SUMMARY_CONTENT_LEN)
            .last()
            .map(|(idx, c)| idx + c.len_utf8())
            .unwrap_or(MAX_SUMMARY_CONTENT_LEN);
        if let Some(last_newline) = content[..end].rfind('\n') {
            format!("{}...", &content[..last_newline])
        } else {
            format!("{}...", &content[..end])
        }
    };

    let request = InferenceRequest {
        prompt: format!(
            "用 1-2 句话总结以下内容的要点，要求简洁准确，不超过 100 字：\n\n{}",
            truncated
        ),
        system_prompt: Some("你是一个文本摘要助手。只返回摘要文本，不要添加前缀或解释。".to_string()),
        max_tokens: Some(MAX_SUMMARY_TOKENS),
        temperature: Some(0.3),
        top_p: None,
    };

    let ai_state = app.state::<AiState>();
    let provider = ai_state.provider.lock().await;

    if !provider.is_available() {
        return None;
    }

    match tokio::time::timeout(
        std::time::Duration::from_secs(20),
        provider.infer(request),
    )
    .await
    {
        Ok(Ok(response)) => {
            let summary = response.text.trim().to_string();
            if summary.is_empty() {
                None
            } else {
                Some(summary)
            }
        }
        Ok(Err(e)) => {
            eprintln!("[ai-processor] AI summary generation failed: {}", e);
            None
        }
        Err(_) => {
            eprintln!("[ai-processor] AI summary generation timed out");
            None
        }
    }
}

/// Internal DB update function for use in background tasks (no tauri::State dependency).
fn update_ai_metadata_internal(
    conn: &std::sync::Mutex<rusqlite::Connection>,
    id: &str,
    ai_type: Option<String>,
    ai_tags: Option<String>,
    ai_summary: Option<String>,
) -> Result<(), String> {
    // Validate ai_type (T-05-03 mitigation)
    if let Some(ref t) = ai_type {
        if !ALLOWED_AI_TYPES.contains(&t.as_str()) {
            return Err(format!("Invalid ai_type: {}", t));
        }
    }

    // Validate ai_tags (T-05-03 mitigation)
    if let Some(ref tags_str) = ai_tags {
        let parsed: serde_json::Value = serde_json::from_str(tags_str)
            .map_err(|e| format!("ai_tags must be valid JSON: {}", e))?;
        if let serde_json::Value::Array(arr) = &parsed {
            for item in arr {
                if let serde_json::Value::String(s) = item {
                    if s.len() > MAX_TAG_LEN {
                        return Err(format!("Tag too long (max {} chars): {}", MAX_TAG_LEN, s));
                    }
                }
            }
        }
    }

    let conn = conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "UPDATE clipboard_items SET ai_type = ?1, ai_tags = ?2, ai_summary = ?3 WHERE id = ?4",
        rusqlite::params![ai_type, ai_tags, ai_summary, id],
    )
    .map_err(|e| format!("Update AI metadata error: {}", e))?;
    Ok(())
}

/// Parse AI response into a validated list of tags.
fn parse_tags_response(text: &str) -> Option<Vec<String>> {
    // Try direct JSON parse
    let cleaned = text.trim_start_matches('`').trim_end_matches('`');
    let cleaned = cleaned.trim_start_matches("json").trim();

    let parsed: serde_json::Value = serde_json::from_str(cleaned).ok()?;

    if let serde_json::Value::Array(arr) = parsed {
        let tags: Vec<String> = arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .filter(|s| !s.is_empty() && s.len() <= MAX_TAG_LEN)
            .take(MAX_TAGS)
            .collect();

        if tags.is_empty() {
            None
        } else {
            Some(tags)
        }
    } else {
        None
    }
}

/// Truncate content for AI prompts to avoid exceeding context limits.
fn truncate_for_ai(content: &str) -> String {
    if content.len() <= MAX_AI_CONTENT_LEN {
        content.to_string()
    } else {
        let truncated = &content[..MAX_AI_CONTENT_LEN];
        // Try to break at a clean boundary
        if let Some(last_newline) = truncated.rfind('\n') {
            format!("{}...", &content[..last_newline])
        } else {
            format!("{}...", truncated)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_json_object() {
        assert_eq!(
            detect_type_rules(r#"{"key": "value", "count": 42}"#),
            Some("json".to_string())
        );
    }

    #[test]
    fn test_detect_json_array() {
        assert_eq!(
            detect_type_rules(r#"[1, 2, 3]"#),
            Some("json".to_string())
        );
    }

    #[test]
    fn test_detect_json_not_bare_string() {
        // Bare string should NOT be classified as JSON
        assert_eq!(detect_type_rules(r#""hello""#), None);
    }

    #[test]
    fn test_detect_xml_declaration() {
        assert_eq!(
            detect_type_rules("<?xml version=\"1.0\"?><root><item>test</item></root>"),
            Some("xml".to_string())
        );
    }

    #[test]
    fn test_detect_xml_tags() {
        assert_eq!(
            detect_type_rules("<config><setting>value</setting></config>"),
            Some("xml".to_string())
        );
    }

    #[test]
    fn test_detect_link_single() {
        assert_eq!(
            detect_type_rules("https://example.com/path?query=1"),
            Some("link".to_string())
        );
    }

    #[test]
    fn test_detect_code_javascript() {
        let code = "function hello() {\n  console.log('hi');\n  return true;\n}";
        assert_eq!(detect_type_rules(code), Some("code".to_string()));
    }

    #[test]
    fn test_detect_code_python() {
        let code = "def process_data(items):\n    result = []\n    for item in items:\n        result.append(item.strip())\n    return result";
        assert_eq!(detect_type_rules(code), Some("code".to_string()));
    }

    #[test]
    fn test_detect_plain_text() {
        assert_eq!(detect_type_rules("Hello, this is a normal sentence."), None);
    }

    #[test]
    fn test_parse_tags_response_valid() {
        let tags = parse_tags_response(r#"["javascript", "async", "error handling"]"#);
        assert_eq!(tags, Some(vec!["javascript".to_string(), "async".to_string(), "error handling".to_string()]));
    }

    #[test]
    fn test_parse_tags_response_with_backticks() {
        let tags = parse_tags_response("```json\n[\"python\", \"data\"]\n```");
        assert_eq!(tags, Some(vec!["python".to_string(), "data".to_string()]));
    }

    #[test]
    fn test_parse_tags_response_empty_array() {
        let tags = parse_tags_response("[]");
        assert_eq!(tags, None);
    }

    #[test]
    fn test_truncate_for_ai_short() {
        let content = "short text";
        assert_eq!(truncate_for_ai(content), content.to_string());
    }

    #[test]
    fn test_truncate_for_ai_long() {
        let content = "a".repeat(5000);
        let result = truncate_for_ai(&content);
        assert!(result.len() <= MAX_AI_CONTENT_LEN + 3); // +3 for "..."
        assert!(result.ends_with("..."));
    }
}
