use tauri::{
    AppHandle, Emitter, Manager, Runtime,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use std::sync::atomic::{AtomicBool, Ordering};

/// Global flag indicating whether screen recording is in progress.
static RECORDING_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Build the tray menu items. Platform-specific items (screenshot, recording)
/// are only included on macOS where the tools exist.
fn build_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    {
        let screenshot_i = MenuItem::with_id(app, "screenshot", "Screenshot", true, None::<&str>)?;
        let record_i = MenuItem::with_id(app, "record", "Screen Recording", true, None::<&str>)?;
        let quick_paste_i = MenuItem::with_id(app, "quick-paste", "Quick Paste", true, None::<&str>)?;
        let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
        let pause_i = MenuItem::with_id(app, "pause", "Pause Monitoring", true, None::<&str>)?;
        let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

        Ok(Menu::with_items(app, &[
            &screenshot_i,
            &record_i,
            &PredefinedMenuItem::separator(app)?,
            &quick_paste_i,
            &show_i,
            &pause_i,
            &PredefinedMenuItem::separator(app)?,
            &quit_i,
        ])?)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let quick_paste_i = MenuItem::with_id(app, "quick-paste", "Quick Paste", true, None::<&str>)?;
        let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
        let pause_i = MenuItem::with_id(app, "pause", "Pause Monitoring", true, None::<&str>)?;
        let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

        Ok(Menu::with_items(app, &[
            &quick_paste_i,
            &show_i,
            &pause_i,
            &PredefinedMenuItem::separator(app)?,
            &quit_i,
        ])?)
    }
}

/// Set up the system tray icon with context menu.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_menu(app)?;

    // Clone items that need to be updated from the event handler.
    let pause_i = MenuItem::with_id(app, "pause", "Pause Monitoring", true, None::<&str>)?;
    let pause_item = pause_i.clone();

    #[cfg(target_os = "macos")]
    let record_item = {
        let record_i = MenuItem::with_id(app, "record", "Screen Recording", true, None::<&str>)?;
        record_i.clone()
    };

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("ABoard - Clipboard Manager")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            #[cfg(target_os = "macos")]
            "screenshot" => {
                capture_screenshot(app.clone());
            }
            #[cfg(target_os = "macos")]
            "record" => {
                if RECORDING_ACTIVE.load(Ordering::SeqCst) {
                    return;
                }
                start_screen_recording(app.clone(), record_item.clone());
            }
            "quick-paste" => {
                if let Some(webview_window) = app.get_webview_window("floating") {
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
                        let mon_w = mon_size.width as f64 / scale;
                        let win_w = win_size.width as f64 / scale;
                        let mon_h = mon_size.height as f64 / scale;
                        let win_h = win_size.height as f64 / scale;
                        let new_x = mon_w - win_w - 20.0;
                        let new_y = (mon_h - win_h) / 2.0;
                        let _ = webview_window.set_position(tauri::Position::Logical(
                            tauri::LogicalPosition::new(new_x.max(0.0), new_y.max(0.0)),
                        ));
                    }
                    let _ = webview_window.show();
                    let _ = webview_window.set_focus();
                }
            }
            "show" => {
                if let Some(webview_window) = app.get_webview_window("main") {
                    let _ = webview_window.show();
                    let _ = webview_window.set_focus();
                }
            }
            "pause" => {
                let paused = crate::clipboard::toggle_monitoring();
                let _ = pause_item.set_text(if paused {
                    "Resume Monitoring"
                } else {
                    "Pause Monitoring"
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => (),
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(webview_window) = app.get_webview_window("main") {
                    let _ = webview_window.show();
                    let _ = webview_window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// macOS-only: screenshot and screen recording
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn capture_screenshot<R: Runtime>(app: AppHandle<R>) {
    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };
    let data_dir = app_data_dir.join("data");
    let _ = std::fs::create_dir_all(&data_dir);

    let tmp_path = std::env::temp_dir().join(format!("aboard_screenshot_{}.png", uuid::Uuid::new_v4()));

    let result = std::process::Command::new("screencapture")
        .arg("-i")
        .arg(&tmp_path)
        .status();

    match result {
        Ok(status) if status.success() => {
            if tmp_path.exists() {
                let bytes = match std::fs::read(&tmp_path) {
                    Ok(b) => b,
                    Err(_) => { let _ = std::fs::remove_file(&tmp_path); return; }
                };

                let id = uuid::Uuid::new_v4().to_string();
                let file_name = format!("{}.png", id);
                let dest_path = data_dir.join(&file_name);
                if std::fs::write(&dest_path, &bytes).is_err() {
                    let _ = std::fs::remove_file(&tmp_path);
                    return;
                }
                let _ = std::fs::remove_file(&tmp_path);

                let file_path_str = format!("data/{}", file_name);
                let hash = {
                    use sha2::{Digest, Sha256};
                    let mut hasher = Sha256::new();
                    hasher.update(&bytes);
                    format!("{:x}", hasher.finalize())
                };
                let timestamp = chrono::Utc::now().timestamp_millis();

                let db_state = app.state::<crate::db::DbState>();
                if let Ok(conn) = db_state.conn.lock() {
                    let _ = conn.execute(
                        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, metadata, pinned, file_path) VALUES (?1, 'image', '', ?2, ?3, '{}', 0, ?4)",
                        rusqlite::params![id, hash, timestamp, file_path_str],
                    );
                }

                let _ = app.emit("clipboard-update", serde_json::json!({
                    "id": id,
                    "type": "image",
                    "content": format!("data:image/png;base64,{}", base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes)),
                    "hash": hash,
                    "timestamp": timestamp,
                    "metadata": {},
                    "pinned": false,
                    "file_path": file_path_str,
                }));
            }
        }
        _ => {
            let _ = std::fs::remove_file(&tmp_path);
        }
    }
}

#[cfg(target_os = "macos")]
fn start_screen_recording<R: Runtime>(app: AppHandle<R>, record_item: MenuItem<R>) {
    let version_output = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output();

    if let Ok(output) = version_output {
        let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let major: u32 = version_str.split('.').next().unwrap_or("0").parse().unwrap_or(0);
        if major < 14 {
            let _ = app.emit("show-alert", "Screen recording requires macOS 14+ Sonoma");
            return;
        }
    }

    RECORDING_ACTIVE.store(true, Ordering::SeqCst);
    let _ = record_item.set_text("Stop Recording");

    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(_) => { RECORDING_ACTIVE.store(false, Ordering::SeqCst); return; }
    };
    let data_dir = app_data_dir.join("data");
    let _ = std::fs::create_dir_all(&data_dir);

    let id = uuid::Uuid::new_v4().to_string();
    let file_name = format!("{}.mp4", id);
    let dest_path = data_dir.join(&file_name);

    let app_clone = app.clone();
    let record_item_clone = record_item.clone();
    std::thread::spawn(move || {
        let status = std::process::Command::new("screencapture")
            .arg("-r")
            .arg(&dest_path)
            .status();

        RECORDING_ACTIVE.store(false, Ordering::SeqCst);
        let _ = record_item_clone.set_text("Screen Recording");

        if let Ok(status) = status {
            if status.success() && dest_path.exists() {
                let bytes = match std::fs::read(&dest_path) {
                    Ok(b) => b,
                    Err(_) => return,
                };

                let file_path_str = format!("data/{}", file_name);
                let hash = {
                    use sha2::{Digest, Sha256};
                    let mut hasher = Sha256::new();
                    hasher.update(&bytes);
                    format!("{:x}", hasher.finalize())
                };
                let timestamp = chrono::Utc::now().timestamp_millis();

                let db_state = app_clone.state::<crate::db::DbState>();
                if let Ok(conn) = db_state.conn.lock() {
                    let _ = conn.execute(
                        "INSERT INTO clipboard_items (id, content_type, content, hash, timestamp, metadata, pinned, file_path) VALUES (?1, 'video', '', ?2, ?3, '{}', 0, ?4)",
                        rusqlite::params![id, hash, timestamp, file_path_str],
                    );
                }

                let _ = app_clone.emit("clipboard-update", serde_json::json!({
                    "id": id,
                    "type": "video",
                    "content": "",
                    "hash": hash,
                    "timestamp": timestamp,
                    "metadata": {},
                    "pinned": false,
                    "file_path": file_path_str,
                }));
            } else {
                let _ = std::fs::remove_file(&dest_path);
            }
        }
    });
}

// ---------------------------------------------------------------------------
// macOS: application menu bar
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
pub fn setup_app_menu<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let about_i = MenuItem::with_id(app, "about", "About ABoard", true, None::<&str>)?;
    let settings_i = MenuItem::with_id(app, "app-settings", "Settings...", true, Some("Cmd+,"))?;
    let hide_i = PredefinedMenuItem::hide(app, None)?;
    let quit_i = PredefinedMenuItem::quit(app, None)?;

    let aboard_menu = Submenu::with_items(
        app,
        "ABoard",
        true,
        &[&about_i, &settings_i, &PredefinedMenuItem::separator(app)?, &hide_i, &quit_i],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let menu = Menu::with_items(app, &[&aboard_menu, &edit_menu])?;
    app.set_menu(menu)?;

    app.on_menu_event(move |app, event| {
        match event.id().as_ref() {
            "app-settings" => {
                let _ = app.emit("open-settings", ());
            }
            "about" => {
                let _ = app.emit("open-settings", ());
            }
            _ => {}
        }
    });

    Ok(())
}
