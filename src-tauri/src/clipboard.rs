use crate::db;
use crate::db::DbState;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;
use uuid::Uuid;

/// Maximum clipboard content size to process (10 MB).
/// Content exceeding this limit is silently skipped to prevent DoS.
const MAX_CONTENT_SIZE: usize = 10 * 1024 * 1024;

/// Polling interval in milliseconds for clipboard change detection.
const POLL_INTERVAL_MS: u64 = 200;

/// Global flag for pausing/resuming clipboard monitoring.
static MONITORING_PAUSED: AtomicBool = AtomicBool::new(false);

/// The type of content stored in the clipboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "content")]
#[allow(dead_code)]
pub enum ClipboardContent {
    Text(String),
    Image(String),       // base64 encoded
    FilePaths(String),   // JSON array string
}

/// A captured clipboard item with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    #[serde(rename = "type")]
    pub content_type: String,
    pub content: String,
    pub hash: String,
    pub timestamp: i64,
    pub metadata: serde_json::Value,
    #[serde(default)]
    pub pinned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pinned_at: Option<i64>,
    /// AI-detected content type: code, link, json, xml, image, text
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_type: Option<String>,
    /// AI-generated semantic tags, stored as JSON array string
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_tags: Option<String>,
    /// AI-generated summary
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_summary: Option<String>,
}

/// Compute SHA256 hash of the given byte slice.
pub fn compute_hash(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    format!("{:x}", hasher.finalize())
}

/// Toggle clipboard monitoring on/off.
/// Returns the new paused state: true = paused, false = active.
#[tauri::command]
pub fn toggle_monitoring() -> bool {
    let current = MONITORING_PAUSED.load(Ordering::SeqCst);
    MONITORING_PAUSED.store(!current, Ordering::SeqCst);
    !current
}

/// Start the clipboard monitoring loop.
/// Spawns an async task that polls the clipboard every POLL_INTERVAL_MS.
/// When new content is detected (via SHA256 hash comparison), emits a
/// "clipboard-update" Tauri event with the ClipboardItem payload.
pub fn start_monitoring<R: Runtime>(app: tauri::AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        let mut last_hash = String::new();
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)).await;

            // Check if monitoring is paused
            if MONITORING_PAUSED.load(Ordering::SeqCst) {
                continue;
            }

            // Try to read clipboard text first
            let text_result = app.clipboard().read_text();
            match text_result {
                Ok(text) => {
                    let trimmed = text.trim();
                    if trimmed.is_empty() {
                        // Text is empty, try image
                        if let Some(img_item) = try_read_image(&app) {
                            let hash = img_item.hash.clone();
                            if hash == last_hash {
                                continue;
                            }
                            last_hash = hash;
                            persist_and_emit(&app, img_item);
                        }
                        continue;
                    }

                    // Size guard: skip oversized content
                    if trimmed.len() > MAX_CONTENT_SIZE {
                        eprintln!(
                            "[clipboard] Skipping content exceeding {} bytes",
                            MAX_CONTENT_SIZE
                        );
                        continue;
                    }

                    let hash = compute_hash(trimmed.as_bytes());
                    if hash == last_hash {
                        continue;
                    }
                    last_hash = hash.clone();

                    // Detect content type
                    let (content_type, content) = detect_content_type(trimmed);

                    let item = ClipboardItem {
                        id: Uuid::new_v4().to_string(),
                        content_type,
                        content,
                        hash,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        metadata: serde_json::json!({
                            "length": trimmed.len(),
                        }),
                        pinned: false,
                        pinned_at: None,
                        ai_type: None,
                        ai_tags: None,
                        ai_summary: None,
                    };

                    persist_and_emit(&app, item);
                }
                Err(_) => {
                    // Clipboard may contain non-text content (image, etc.)
                    if let Some(img_item) = try_read_image(&app) {
                        let hash = img_item.hash.clone();
                        if hash == last_hash {
                            continue;
                        }
                        last_hash = hash;
                        persist_and_emit(&app, img_item);
                    }
                }
            }
        }
    });
}

/// Detect the type of clipboard text content.
/// Returns (type_name, content_string).
fn detect_content_type(text: &str) -> (String, String) {
    // Check if text looks like file paths
    if is_file_paths(text) {
        return ("file-paths".to_string(), text.to_string());
    }

    // Default to plain text
    ("text".to_string(), text.to_string())
}

/// Try to read an image from the clipboard.
/// Returns Some(ClipboardItem) with base64-encoded PNG, or None.
fn try_read_image<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<ClipboardItem> {
    let img_result = app.clipboard().read_image();
    match img_result {
        Ok(tauri_img) => {
            let rgba = tauri_img.rgba();
            let w = tauri_img.width();
            let h = tauri_img.height();

            // Size guard: skip images larger than 5MB raw RGBA
            if rgba.len() > 5 * 1024 * 1024 {
                eprintln!("[clipboard] Skipping oversized image ({} bytes)", rgba.len());
                return None;
            }

            // Encode RGBA to PNG using the image crate
            let img_buffer = image::RgbaImage::from_raw(w, h, rgba.to_vec())?;
            let mut png_buf = std::io::Cursor::new(Vec::new());
            if img_buffer.write_to(&mut png_buf, image::ImageFormat::Png).is_err() {
                return None;
            }
            let png_data = png_buf.into_inner();
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png_data);
            let data_url = format!("data:image/png;base64,{}", b64);

            // Compute hash from PNG bytes (not base64) for consistent dedup
            let hash = compute_hash(&png_data);

            Some(ClipboardItem {
                id: Uuid::new_v4().to_string(),
                content_type: "image".to_string(),
                content: data_url,
                hash,
                timestamp: chrono::Utc::now().timestamp_millis(),
                metadata: serde_json::json!({
                    "width": w,
                    "height": h,
                    "size": png_data.len(),
                }),
                pinned: false,
                pinned_at: None,
                ai_type: Some("image".to_string()),
                ai_tags: None,
                ai_summary: None,
            })
        }
        Err(_) => None,
    }
}

/// Persist a clipboard item to DB, emit event, and enqueue AI processing.
fn persist_and_emit<R: Runtime>(app: &tauri::AppHandle<R>, item: ClipboardItem) {
    let db_state = app.state::<DbState>();
    if let Err(e) = db::insert_item(&db_state.conn, &item) {
        eprintln!("[clipboard] Failed to persist item: {}", e);
    }

    if let Err(e) = app.emit("clipboard-update", &item) {
        eprintln!("[clipboard] Failed to emit event: {}", e);
    } else {
        println!(
            "[clipboard] Captured {} ({} bytes, hash: {}...)",
            item.content_type,
            item.content.len(),
            &item.hash[..8.min(item.hash.len())]
        );
    }

    // Enqueue AI processing job (async, non-blocking) — skip for images
    if item.content_type != "image" {
        let processor = app.state::<crate::ai::processor::AiProcessor>();
        crate::ai::processor::enqueue(&processor, crate::ai::processor::ProcessingJob {
            item_id: item.id.clone(),
            content: item.content.clone(),
            content_type: item.content_type.clone(),
        });
    }
}

/// Check if the text content looks like file paths.
/// Heuristic: multiple lines where each line looks like a path,
/// or the text starts with file://
fn is_file_paths(text: &str) -> bool {
    // Check for file:// URI prefix
    if text.starts_with("file://") {
        return true;
    }

    // Check if multiple lines all look like file paths
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() > 1 {
        let path_like_count = lines
            .iter()
            .filter(|line| {
                let l = line.trim();
                l.starts_with('/') ||      // Unix absolute path
                l.starts_with("~/") ||     // Home dir
                l.starts_with("..\\") ||   // Windows relative
                l.starts_with(".\\") ||    // Windows relative
                (l.len() > 2 && l.as_bytes().get(1) == Some(&b':') && l.as_bytes().get(2) == Some(&b'\\'))  // Windows C:\
            })
            .count();
        // If more than half the lines look like paths, treat as file paths
        if path_like_count > lines.len() / 2 {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_hash_deterministic() {
        let hash1 = compute_hash(b"hello world");
        let hash2 = compute_hash(b"hello world");
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64); // SHA256 hex is 64 chars
    }

    #[test]
    fn test_compute_hash_different_inputs() {
        let hash1 = compute_hash(b"hello");
        let hash2 = compute_hash(b"world");
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_detect_text_type() {
        let (ct, _) = detect_content_type("Hello, world!");
        assert_eq!(ct, "text");
    }

    #[test]
    fn test_detect_file_paths_uri() {
        let (ct, _) = detect_content_type("file:///Users/test/doc.txt");
        assert_eq!(ct, "file-paths");
    }

    #[test]
    fn test_detect_file_paths_unix() {
        let (ct, _) = detect_content_type("/Users/test/file1.txt\n/Users/test/file2.txt\n/Users/test/file3.txt");
        assert_eq!(ct, "file-paths");
    }

    #[test]
    fn test_toggle_monitoring() {
        let initial = MONITORING_PAUSED.load(Ordering::SeqCst);
        let new_state = toggle_monitoring();
        assert_eq!(new_state, !initial);
        // Toggle back to restore state
        toggle_monitoring();
    }
}
