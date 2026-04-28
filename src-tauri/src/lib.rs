#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod clipboard;
mod db;
mod tray;

use std::sync::Mutex;
use std::time::Instant;
use tauri::{Emitter, Manager};

/// State for quick-switch cycling through clipboard history.
struct CycleState {
    index: usize,
    last_cycle: Option<Instant>,
}

/// Copy image from base64 data URL to system clipboard as a real image.
/// Open a URL in the system's default browser.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(&url).spawn().map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd")
            .args(["/c", "start", &url])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    Ok(())
}

/// Copy image from clipboard item ID to system clipboard as a real image.
/// Reads image data from the database to avoid large IPC payloads.
#[tauri::command]
fn copy_image_to_clipboard(item_id: String, app: tauri::AppHandle) -> Result<(), String> {
    // Read item content from DB
    let db_state = app.state::<crate::db::DbState>();
    let content: String = {
        let conn = db_state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
        conn.query_row(
            "SELECT content FROM clipboard_items WHERE id = ?1",
            rusqlite::params![item_id],
            |row| row.get(0),
        ).map_err(|e| format!("Item not found: {}", e))?
    };

    // Strip "data:image/...;base64," prefix
    let b64 = content
        .find(",base64,")
        .map(|i| &content[i + 8..])
        .ok_or("Invalid data URL format")?;

    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    // macOS: write PNG to temp file, use AppleScriptObjC to set clipboard
    #[cfg(target_os = "macos")]
    {
        let tmp = std::env::temp_dir().join("aboard_copy_img.png");
        std::fs::write(&tmp, &bytes).map_err(|e| format!("Write temp file error: {}", e))?;
        let tmp_str = tmp.to_str().ok_or("Invalid temp path")?.replace('\\', "\\\\");
        let script = format!(r#"
use framework "AppKit"
set pb to current application's NSPasteboard's generalPasteboard()
pb's clearContents()
set imgData to current application's NSImage's alloc()'s initWithContentsOfFile:"{path}"
if imgData is not missing value then
    pb's writeObjects:{{imgData}}
    return "OK"
else
    return "ERR"
end if
"#, path = tmp_str);
        let output = std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output();
        let _ = std::fs::remove_file(&tmp);
        let out = output.map_err(|e| format!("osascript error: {}", e))?;
        let result = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if result != "OK" {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(format!("osascript failed: {} ({})", result, stderr.trim()));
        }
        return Ok(());
    }

    // Windows / Linux: use Tauri clipboard plugin
    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_clipboard_manager::ClipboardExt;
        let img = image::load_from_memory(&bytes)
            .map_err(|e| format!("Image decode error: {}", e))?;
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        let tauri_img = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
        app.clipboard()
            .write_image(&tauri_img)
            .map_err(|e| format!("Clipboard write error: {}", e))?;
        Ok(())
    }
}

/// Reveal a file in the system file manager (Finder / Explorer / file manager).
/// Accepts a relative path from the app data directory (e.g. "data/xxx.mp4").
#[tauri::command]
fn reveal_in_folder(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| format!("{:?}", e))?;
    let full_path = app_data_dir.join(&file_path);

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&full_path)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        if !full_path.exists() {
            return Err("File not found".to_string());
        }
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", full_path.display()))
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        // Open the parent folder (xdg-open doesn't support file selection)
        let parent = full_path.parent().unwrap_or(&full_path);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(())
}

/// Emit "open-settings" event to the main window so it opens the settings panel.
#[tauri::command]
fn emit_open_settings(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("open-settings", ());
    Ok(())
}

/// Show the main window (called from floating popup footer button).
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview_window) = app.get_webview_window("main") {
        let _ = webview_window.show();
        let _ = webview_window.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn paste_to_active(content: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let _ = app.clipboard().write_text(&content);

    #[cfg(target_os = "macos")]
    {
        use core_graphics::event::{CGEvent, CGEventFlags};
        use core_graphics::event_source::CGEventSource;
        use core_graphics::event_source::CGEventSourceStateID::HIDSystemState;

        let source = CGEventSource::new(HIDSystemState).map_err(|_| "Failed to create CGEventSource".to_string())?;

        let post_tap = core_graphics::event::CGEventTapLocation::HID;

        // Cmd down
        let cmd_down = CGEvent::new_keyboard_event(source.clone(), 55, true)
            .map_err(|_| "Failed to create Cmd down event".to_string())?;
        cmd_down.set_flags(CGEventFlags::CGEventFlagCommand);
        cmd_down.post(post_tap);

        // V down
        let v_down = CGEvent::new_keyboard_event(source.clone(), 9, true)
            .map_err(|_| "Failed to create V down event".to_string())?;
        v_down.set_flags(CGEventFlags::CGEventFlagCommand);
        v_down.post(post_tap);

        // V up
        let v_up = CGEvent::new_keyboard_event(source.clone(), 9, false)
            .map_err(|_| "Failed to create V up event".to_string())?;
        v_up.set_flags(CGEventFlags::CGEventFlagCommand);
        v_up.post(post_tap);

        // Cmd up
        let cmd_up = CGEvent::new_keyboard_event(source, 55, false)
            .map_err(|_| "Failed to create Cmd up event".to_string())?;
        cmd_up.post(post_tap);
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::thread::sleep(std::time::Duration::from_millis(50));
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("SendKeys error: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdotool")
            .args(["key", "--clearmodifiers", "ctrl+v"])
            .spawn();
    }
    Ok(())
}

/// Quick switch: cycle through recent clipboard items and paste directly.
/// Each call advances to the next item. Resets after 2 seconds of inactivity.
#[tauri::command]
fn quick_cycle(app: tauri::AppHandle, cycle: tauri::State<'_, Mutex<CycleState>>) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    let mut state = cycle.lock().map_err(|e| format!("Lock error: {}", e))?;
    let now = Instant::now();

    // Reset cycle if last press was more than 2 seconds ago
    let should_reset = match state.last_cycle {
        Some(last) => now.duration_since(last).as_secs() >= 2,
        None => true,
    };

    if should_reset {
        state.index = 0;
    } else {
        state.index += 1;
    }
    state.last_cycle = Some(now);

    let idx = state.index;
    drop(state); // Release lock before DB query

    // Get the Nth recent item from DB
    let db_state = app.state::<db::DbState>();
    let content: String = {
        let conn = db_state.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
        let content: String = conn
            .query_row(
                "SELECT content FROM clipboard_items
                 ORDER BY pinned DESC, pinned_at DESC, timestamp DESC
                 LIMIT 1 OFFSET ?1",
                rusqlite::params![idx],
                |row| row.get(0),
            )
            .map_err(|e| format!("No item at index {}: {}", idx, e))?;
        content
    };

    // Write to clipboard
    let _ = app.clipboard().write_text(&content);

    // Simulate Cmd+V paste on macOS
    #[cfg(target_os = "macos")]
    {
        use core_graphics::event::{CGEvent, CGEventFlags};
        use core_graphics::event_source::CGEventSource;
        use core_graphics::event_source::CGEventSourceStateID::HIDSystemState;

        let source = CGEventSource::new(HIDSystemState).map_err(|_| "Failed to create CGEventSource".to_string())?;
        let post_tap = core_graphics::event::CGEventTapLocation::HID;

        let cmd_down = CGEvent::new_keyboard_event(source.clone(), 55, true)
            .map_err(|_| "Failed to create Cmd down event".to_string())?;
        cmd_down.set_flags(CGEventFlags::CGEventFlagCommand);
        cmd_down.post(post_tap);

        let v_down = CGEvent::new_keyboard_event(source.clone(), 9, true)
            .map_err(|_| "Failed to create V down event".to_string())?;
        v_down.set_flags(CGEventFlags::CGEventFlagCommand);
        v_down.post(post_tap);

        let v_up = CGEvent::new_keyboard_event(source.clone(), 9, false)
            .map_err(|_| "Failed to create V up event".to_string())?;
        v_up.set_flags(CGEventFlags::CGEventFlagCommand);
        v_up.post(post_tap);

        let cmd_up = CGEvent::new_keyboard_event(source, 55, false)
            .map_err(|_| "Failed to create Cmd up event".to_string())?;
        cmd_up.post(post_tap);
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::thread::sleep(std::time::Duration::from_millis(50));
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("SendKeys error: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdotool")
            .args(["key", "--clearmodifiers", "ctrl+v"])
            .spawn();
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::Manager;
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let toggle_shortcut =
                    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyV);

                // Quick cycle shortcut: Cmd+Shift+J
                let cycle_shortcut =
                    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyJ);

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                // Toggle floating popup: Cmd+Shift+V
                                if shortcut == &toggle_shortcut {
                                    if let Some(webview_window) = app.get_webview_window("floating") {
                                        if webview_window.is_visible().unwrap_or(false) {
                                            let _ = webview_window.hide();
                                        } else {
                                            // Position floating window on right side, vertically centered
                                            let monitor = app.primary_monitor()
                                                .ok()
                                                .flatten()
                                                .or_else(|| {
                                                    app.available_monitors()
                                                        .ok()
                                                        .and_then(|m| m.into_iter().next())
                                                });
                                            if let Some(monitor) = monitor {
                                                let scale = monitor.scale_factor();
                                                let mon_size = monitor.size();
                                                let win_size = webview_window.inner_size().unwrap_or_else(|_| {
                                                    tauri::PhysicalSize::new(280, 520)
                                                });
                                                // Convert physical → logical coordinates
                                                let mon_w = mon_size.width as f64 / scale;
                                                let win_w = win_size.width as f64 / scale;
                                                let mon_h = mon_size.height as f64 / scale;
                                                let win_h = win_size.height as f64 / scale;
                                                let new_x = mon_w - win_w - 20.0; // 20px margin from right edge
                                                let new_y = (mon_h - win_h) / 2.0; // vertically centered
                                                let _ = webview_window.set_position(
                                                    tauri::Position::Logical(
                                                        tauri::LogicalPosition::new(
                                                            new_x.max(0.0),
                                                            new_y.max(0.0),
                                                        ),
                                                    ),
                                                );
                                            }
                                            let _ = webview_window.show();
                                            let _ = webview_window.set_focus();
                                        }
                                    }
                                }
                                // Quick cycle: Cmd+Shift+J
                                if shortcut == &cycle_shortcut {
                                    let cycle_state = app.state::<Mutex<CycleState>>();
                                    let _ = quick_cycle(app.clone(), cycle_state);
                                }
                            }
                        })
                        .build(),
                )?;

                let gs = app.global_shortcut();
                let _ = gs.register(toggle_shortcut);
                let _ = gs.register(cycle_shortcut);
            }

            db::init_db(&app.handle())?;
            ai::init_ai(&app.handle())?;

            // Start AI auto-processing queue
            let processor = ai::processor::start_processor(app.handle().clone());
            app.manage(processor);

            // Quick cycle state
            app.manage(Mutex::new(CycleState {
                index: 0,
                last_cycle: None,
            }));

            clipboard::start_monitoring(app.handle().clone());
            tray::setup_tray(&app.handle())?;

            // Start auto-cleanup background task
            db::start_auto_cleanup(app.handle().clone());

            // macOS: set up native application menu bar
            #[cfg(target_os = "macos")]
            {
                tray::setup_app_menu(&app.handle())?;
            }

            // Windows/Linux: hide system decorations to avoid double title bar.
            // macOS uses Overlay titleBarStyle (set in tauri.conf.json) which
            // shows traffic lights without a visible title bar.
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.set_decorations(false);
                }
                if let Some(win) = app.get_webview_window("floating") {
                    let _ = win.set_decorations(false);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            paste_to_active,
            open_url,
            copy_image_to_clipboard,
            show_main_window,
            emit_open_settings,
            clipboard::toggle_monitoring,
            clipboard::get_monitoring_state,
            tray::update_tray_locale,
            db::get_history,
            db::search_history,
            db::delete_items,
            db::clean_old_items,
            db::pin_item,
            db::unpin_item,
            db::get_pinned,
            ai::ai_infer,
            ai::ai_list_models,
            ai::ai_set_provider,
            ai::ai_download_model,
            ai::ai_delete_model,
            ai::ai_get_config,
            ai::ai_set_config,
            ai::ai_detect_local_provider,
            ai::ai_infer_auto,
            ai::ai_embedded_load,
            ai::ai_embedded_download,
            db::update_ai_metadata,
            db::update_item_content,
            db::insert_clipboard_item,
            db::semantic_search,
            db::export_items,
            db::get_storage_stats,
            db::read_data_file,
            db::get_setting,
            db::set_setting,
            db::create_snippet,
            db::update_snippet,
            db::delete_snippet,
            db::list_snippets,
            reveal_in_folder,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(webview_window) = app_handle.get_webview_window("main") {
                    let _ = webview_window.show();
                    let _ = webview_window.set_focus();
                }
            }
        });
}
