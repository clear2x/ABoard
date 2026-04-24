use crate::db;
use crate::db::DbState;
use arboard::Clipboard as ArboardClipboard;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;
use uuid::Uuid;

/// Maximum clipboard content size to process (10 MB).
/// Content exceeding this limit is silently skipped to prevent DoS.
const MAX_CONTENT_SIZE: usize = 10 * 1024 * 1024;

/// Maximum image size (raw RGBA) to process (15 MB).
/// Limits decoded image data to prevent excessive memory usage.
const MAX_IMAGE_SIZE: usize = 15 * 1024 * 1024;

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
    /// Relative file path in the data directory (for binary content)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

/// Compute SHA256 hash of the given byte slice.
pub fn compute_hash(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    format!("{:x}", hasher.finalize())
}

/// Toggle clipboard monitoring on/off.
/// Returns the new monitoring state: true = monitoring active, false = paused.
#[tauri::command]
pub fn toggle_monitoring() -> bool {
    let current = MONITORING_PAUSED.load(Ordering::SeqCst);
    MONITORING_PAUSED.store(!current, Ordering::SeqCst);
    !current // return true = active (was not paused → now paused means we return the previous paused state inverted)
}

/// Query current monitoring state.
/// Returns true if monitoring is active, false if paused.
#[tauri::command]
pub fn get_monitoring_state() -> bool {
    !MONITORING_PAUSED.load(Ordering::SeqCst)
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

            // Check for multi-file clipboard (Finder copy of multiple files)
            let multi_files = try_read_file_list_multi(&app);
            if !multi_files.is_empty() {
                let first_hash = multi_files[0].hash.clone();
                if first_hash != last_hash {
                    last_hash = first_hash;
                    for item in multi_files {
                        persist_and_emit(&app, item);
                    }
                }
                continue;
            }

            // Check image FIRST — many apps (QQ, WeChat, etc.) put both text and
            // image in the clipboard. If we check text first, the image is missed.
            if let Some(img_item) = try_read_image(&app) {
                let hash = img_item.hash.clone();
                if hash != last_hash {
                    last_hash = hash;
                    persist_and_emit(&app, img_item);
                }
                continue;
            }

            // No image — fall back to text
            let text_result = app.clipboard().read_text();
            if let Ok(ref t) = text_result {
                if !t.trim().is_empty() {
                    eprintln!("[clipboard] [DEBUG] text captured: {} chars, starts_with_data_image={}",
                        t.len(), t.trim().starts_with("data:image/"));
                }
            }
            match text_result {
                Ok(text) => {
                    let trimmed = text.trim();
                    if trimmed.is_empty() {
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
                        file_path: None,
                    };

                    persist_and_emit(&app, item);
                }
                Err(_) => {}
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

/// Check the pasteboard for file references (Finder/Explorer file copies).
/// Uses arboard's native API which properly resolves .file/id= reference URLs
/// on macOS via NSPasteboardURLReadingFileURLsOnlyKey.
/// Returns the first image found (for the main loop), and any additional files
/// are processed separately.
fn try_read_image_file_list() -> Option<ClipboardItem> {
    let mut clipboard = ArboardClipboard::new().ok()?;
    let files = clipboard.get().file_list().ok()?;
    for path in &files {
        let path_str = path.to_string_lossy();
        if let Some(item) = read_image_file(&path_str) {
            return Some(item);
        }
    }
    None
}

/// Maximum number of files to process from a single multi-file clipboard capture.
const MAX_FILES_PER_PASTE: usize = 20;

/// Process multiple files from clipboard (for multi-file copy support).
/// Returns all created items, or empty vec if no files found.
fn try_read_file_list_multi<R: Runtime>(app: &tauri::AppHandle<R>) -> Vec<ClipboardItem> {
    let mut clipboard = match ArboardClipboard::new() {
        Ok(cb) => cb,
        Err(_) => return vec![],
    };
    let files = match clipboard.get().file_list() {
        Ok(f) => f,
        Err(_) => return vec![],
    };

    if files.is_empty() {
        return vec![];
    }

    let mut items = Vec::new();
    for path in files.iter().take(MAX_FILES_PER_PASTE) {
        let path_str = path.to_string_lossy().to_string();

        // Check if it's an image file
        if let Some(item) = read_image_file(&path_str) {
            items.push(item);
            continue;
        }

        // For other files, create a file-paths entry with metadata
        let file_name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let extension = path.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();

        // Check if video
        let content_type = match extension.as_str() {
            "mp4" | "mov" | "avi" | "mkv" | "webm" => "video",
            _ => "file-paths",
        };

        let id = Uuid::new_v4().to_string();
        let hash = compute_hash(path_str.as_bytes());

        items.push(ClipboardItem {
            id,
            content_type: content_type.to_string(),
            content: path_str.clone(),
            hash,
            timestamp: chrono::Utc::now().timestamp_millis(),
            metadata: serde_json::json!({
                "filename": file_name,
                "extension": extension,
            }),
            pinned: false,
            pinned_at: None,
            ai_type: None,
            ai_tags: None,
            ai_summary: None,
            file_path: None,
        });
    }

    items
}

/// Try to read an image from the clipboard.
/// Checks file references first (Finder/Explorer copies), then Tauri's clipboard plugin,
/// then platform-specific fallback methods.
fn try_read_image<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<ClipboardItem> {
    // Method 0: Check for file references (Finder/Explorer file copies).
    // Uses arboard's native API which properly resolves .file/id= reference URLs
    // on macOS via NSPasteboardURLReadingFileURLsOnlyKey.
    if let Some(item) = try_read_image_file_list() {
        return Some(item);
    }

    // Method 1: Tauri clipboard plugin (works for most apps with raw image data)
    let img_result = app.clipboard().read_image();
    match img_result {
        Ok(tauri_img) => {
            let rgba = tauri_img.rgba();
            let w = tauri_img.width();
            let h = tauri_img.height();

            // Size guard
            if rgba.len() > MAX_IMAGE_SIZE {
                eprintln!("[clipboard] Skipping oversized image ({} bytes)", rgba.len());
                return None;
            }

            return encode_and_build_item(&rgba, w, h);
        }
        Err(e) => {
            eprintln!("[clipboard] [DEBUG] read_image err: {:?}", e);
        }
    }

    // Method 2: Platform-specific fallback for apps that Tauri can't read
    #[cfg(target_os = "macos")]
    {
        if let Some(item) = try_read_image_fallback() {
            return Some(item);
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(item) = try_read_image_fallback() {
            return Some(item);
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(item) = try_read_image_fallback() {
            return Some(item);
        }
    }

    None
}

/// Encode raw RGBA data to PNG and build a ClipboardItem.
fn encode_and_build_item(rgba: &[u8], w: u32, h: u32) -> Option<ClipboardItem> {
    let img_buffer = image::RgbaImage::from_raw(w, h, rgba.to_vec())?;
    let mut png_buf = std::io::Cursor::new(Vec::new());
    img_buffer.write_to(&mut png_buf, image::ImageFormat::Png).ok()?;
    let png_data = png_buf.into_inner();
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png_data);
    let data_url = format!("data:image/png;base64,{}", b64);
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
        file_path: None,
    })
}

/// Read an image file from disk and convert to a ClipboardItem.
fn read_image_file(path: &str) -> Option<ClipboardItem> {
    let file_path = std::path::Path::new(path);
    if !file_path.exists() {
        return None;
    }

    // Check extension
    let ext = file_path.extension()?.to_str()?.to_lowercase();
    if !["png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "webp", "avif"].contains(&ext.as_str()) {
        return None;
    }

    let file_data = std::fs::read(file_path).ok()?;
    if file_data.len() > MAX_IMAGE_SIZE {
        eprintln!("[clipboard] Skipping oversized image file ({} bytes)", file_data.len());
        return None;
    }

    let img = image::ImageReader::new(std::io::Cursor::new(&file_data))
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;

    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();

    encode_and_build_item(&rgba, w, h)
}

/// macOS fallback: read image from clipboard via AppleScriptObjC + NSPasteboard.
/// Uses UTI types (public.png, public.tiff, NSFilenamesPboardType, public.file-url)
/// which work on all macOS versions.
#[cfg(target_os = "macos")]
fn try_read_image_fallback() -> Option<ClipboardItem> {
    use std::process::Command;

    let tmp_png = std::env::temp_dir().join("aboard_clip_img.png");
    let tmp_tiff = std::env::temp_dir().join("aboard_clip_img.tiff");
    let tmp_png_str = tmp_png.to_str()?.to_string();
    let tmp_tiff_str = tmp_tiff.to_str()?.to_string();

    // Single AppleScriptObjC script that tries PNG → TIFF → NSFilenames → file-url
    let script = format!(r#"
use framework "AppKit"
use framework "Foundation"
set pb to current application's NSPasteboard's generalPasteboard()

-- Try PNG data
set pngData to pb's dataForType:"public.png"
if pngData is not missing value then
    pngData's writeToFile:"{tmp_png}" atomically:true
    return "PNG"
end if

-- Try TIFF data
set tiffData to pb's dataForType:"public.tiff"
if tiffData is not missing value then
    tiffData's writeToFile:"{tmp_tiff}" atomically:true
    return "TIFF"
end if

-- Try NSFilenamesPboardType (Finder copies give direct file paths)
set theList to pb's propertyListForType:"NSFilenamesPboardType"
if theList is not missing value then
    set firstPath to first item of (theList as list)
    return "FILE:" & (firstPath as text)
end if

-- Try file URL with NSURL resolution (handles .file/id= reference URLs)
set urlData to pb's dataForType:"public.file-url"
if urlData is not missing value then
    set urlStr to (current application's NSString's alloc()'s initWithData:urlData encoding:4) as text
    set nsurl to current application's NSURL's URLWithString:urlStr
    if nsurl is not missing value then
        set resolved to nsurl's filePathURL()
        if resolved is not missing value then
            set pathStr to (resolved's |path|() as text)
            if pathStr is not "" then
                return "FILE:" & pathStr
            end if
        end if
    end if
    -- Fallback: strip file:// and decode percent encoding
    if urlStr starts with "file://" then
        set posixPath to text 8 thru -1 of urlStr
        set decodedPath to (current application's NSString's stringWithString:posixPath)'s stringByReplacingPercentEscapesUsingEncoding:4
        return "FILE:" & (decodedPath as text)
    end if
end if

return ""
"#, tmp_png = tmp_png_str, tmp_tiff = tmp_tiff_str);

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .ok()?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if result == "PNG" && tmp_png.exists() {
        if let Some(item) = read_image_file(&tmp_png_str) {
            let _ = std::fs::remove_file(&tmp_png);
            return Some(item);
        }
        let _ = std::fs::remove_file(&tmp_png);
    }

    if result == "TIFF" && tmp_tiff.exists() {
        if let Some(item) = read_image_file(&tmp_tiff_str) {
            let _ = std::fs::remove_file(&tmp_tiff);
            return Some(item);
        }
        let _ = std::fs::remove_file(&tmp_tiff);
    }

    if result.starts_with("FILE:") {
        let path = &result[5..];
        if let Some(item) = read_image_file(path) {
            return Some(item);
        }
    }

    None
}

/// Windows fallback: read image via PowerShell System.Windows.Forms.
/// Tries clipboard image first, then falls back to file path from Explorer copy.
#[cfg(target_os = "windows")]
fn try_read_image_fallback() -> Option<ClipboardItem> {
    use std::process::Command;

    // Method 1: Try reading image directly from clipboard
    let tmp = std::env::temp_dir().join("aboard_clip.png");
    let tmp_str = tmp.to_str()?;

    let script = format!(
        r#"
Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img) {{
    $img.Save('{}', [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output 'OK'
}}"#,
        tmp_str.replace('\\', "\\\\")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .ok()?;

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if result == "OK" && tmp.exists() {
        if let Some(item) = read_image_file(tmp_str) {
            let _ = std::fs::remove_file(&tmp);
            return Some(item);
        }
        let _ = std::fs::remove_file(&tmp);
    }

    // Method 2: Try file path from Explorer (FileDrop format)
    let file_script = r#"
Add-Type -AssemblyName System.Windows.Forms
$files = [System.Windows.Forms.Clipboard]::GetFileDropList()
if ($files.Count -gt 0) {
    Write-Output $files[0]
}
"#;
    let file_output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", file_script])
        .output()
        .ok()?;

    let file_path = String::from_utf8_lossy(&file_output.stdout).trim().to_string();
    if !file_path.is_empty() {
        if let Some(item) = read_image_file(&file_path) {
            return Some(item);
        }
    }

    None
}

/// Linux fallback: read image via xclip.
/// Tries image/png first, then falls back to text/uri-list for file manager copies.
#[cfg(target_os = "linux")]
fn try_read_image_fallback() -> Option<ClipboardItem> {
    use std::process::Command;

    // Method 1: Try reading image/png directly
    let output = Command::new("xclip")
        .args(["-selection", "clipboard", "-t", "image/png", "-o"])
        .output()
        .ok()?;

    if !output.stdout.is_empty() {
        let img = image::ImageReader::new(std::io::Cursor::new(&output.stdout))
            .with_guessed_format()
            .ok()?
            .decode()
            .ok()?;

        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        return encode_and_build_item(&rgba, w, h);
    }

    // Method 2: Try text/uri-list for file manager copies (e.g. Nautilus)
    let uri_output = Command::new("xclip")
        .args(["-selection", "clipboard", "-t", "text/uri-list", "-o"])
        .output()
        .ok()?;

    let uri_list = String::from_utf8_lossy(&uri_output.stdout);
    for line in uri_list.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        // Convert file:// URI to path, with percent-decode for special chars
        let path = if line.starts_with("file://") {
            let encoded = line.trim_start_matches("file://");
            percent_decode_path(encoded)
        } else {
            line.to_string()
        };
        if let Some(item) = read_image_file(&path) {
            return Some(item);
        }
    }

    None
}

/// Simple percent-decoding for file URI paths (e.g., %20 → space).
#[cfg(target_os = "linux")]
fn percent_decode_path(encoded: &str) -> String {
    let mut result = String::with_capacity(encoded.len());
    let mut chars = encoded.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().unwrap_or(b'0');
            let lo = chars.next().unwrap_or(b'0');
            if let Ok(byte) = u8::from_str_radix(
                &String::from_utf8_lossy(&[hi, lo]),
                16,
            ) {
                result.push(byte as char);
                continue;
            }
        }
        result.push(b as char);
    }
    result
}

/// Persist a clipboard item to DB, emit event, and enqueue AI processing.
fn persist_and_emit<R: Runtime>(app: &tauri::AppHandle<R>, mut item: ClipboardItem) {
    // For image items: save binary data as file instead of base64 in DB
    if item.content_type == "image" && item.content.starts_with("data:image") {
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let data_dir = app_data_dir.join("data");
            let _ = std::fs::create_dir_all(&data_dir);

            // Extract binary data from base64 data URL
            if let Some(b64_start) = item.content.find(",base64,") {
                let b64 = &item.content[b64_start + 8..];
                if let Ok(bytes) = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64) {
                    let file_name = format!("{}.png", item.id);
                    let file_path = data_dir.join(&file_name);
                    if std::fs::write(&file_path, &bytes).is_ok() {
                        let relative = format!("data/{}", file_name);
                        item.file_path = Some(relative);
                        // Keep the base64 content for the event payload (frontend uses it for immediate display)
                        // but clear it for DB storage to save space
                        let event_content = item.content.clone();
                        item.content = String::new(); // Don't store huge base64 in DB

                        let db_state = app.state::<DbState>();
                        if let Err(e) = db::insert_item(&db_state.conn, &item) {
                            eprintln!("[clipboard] Failed to persist item: {}", e);
                        }

                        // Emit with the full content for immediate frontend display
                        let mut emit_item = item.clone();
                        emit_item.content = event_content;
                        if let Err(e) = app.emit("clipboard-update", &emit_item) {
                            eprintln!("[clipboard] Failed to emit event: {}", e);
                        }
                        return;
                    }
                }
            }
        }
    }

    let db_state = app.state::<DbState>();
    if let Err(e) = db::insert_item(&db_state.conn, &item) {
        eprintln!("[clipboard] Failed to persist item: {}", e);
    }

    if let Err(e) = app.emit("clipboard-update", &item) {
        eprintln!("[clipboard] Failed to emit event: {}", e);
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
