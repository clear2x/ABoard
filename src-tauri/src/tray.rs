use tauri::{
    AppHandle, Emitter, Manager, Runtime,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_dialog::DialogExt;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU8, Ordering};
use std::sync::Mutex;

/// Global flag indicating whether screen recording is in progress.
static RECORDING_ACTIVE: AtomicBool = AtomicBool::new(false);

/// PID of the active screencapture recording process, for stopping.
static RECORDING_PID: AtomicU32 = AtomicU32::new(0);

/// Stored locale: 0 = zh, 1 = en
static STORED_LOCALE: AtomicU8 = AtomicU8::new(0);

// ---------------------------------------------------------------------------
// Type-erased menu item handle — stores a set_text closure to avoid generics
// ---------------------------------------------------------------------------

struct TrayItemHandle {
    set_text_fn: Box<dyn Fn(&str) + Send + Sync>,
}

impl TrayItemHandle {
    fn new<R: Runtime>(item: MenuItem<R>) -> Self {
        Self {
            set_text_fn: Box::new(move |text| {
                let _ = item.set_text(text);
            }),
        }
    }

    fn set_text(&self, text: &str) {
        (self.set_text_fn)(text);
    }
}

/// Stores type-erased tray menu item handles keyed by ID.
pub struct TrayMenuState {
    items: Mutex<HashMap<String, TrayItemHandle>>,
}

impl TrayMenuState {
    fn new() -> Self {
        Self {
            items: Mutex::new(HashMap::new()),
        }
    }

    fn insert<R: Runtime>(&self, id: &str, item: MenuItem<R>) {
        self.items
            .lock()
            .unwrap()
            .insert(id.to_string(), TrayItemHandle::new(item));
    }

    fn set_text(&self, id: &str, text: &str) {
        if let Some(handle) = self.items.lock().unwrap().get(id) {
            handle.set_text(text);
        }
    }
}

// ---------------------------------------------------------------------------
// Tray setup
// ---------------------------------------------------------------------------

/// Set up the system tray icon with context menu.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let state = TrayMenuState::new();

    let quick_paste_i = MenuItem::with_id(app, "quick-paste", "Quick Paste", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let pause_i = MenuItem::with_id(app, "pause", "Pause Monitoring", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    state.insert("quick-paste", quick_paste_i.clone());
    state.insert("show", show_i.clone());
    state.insert("pause", pause_i.clone());
    state.insert("quit", quit_i.clone());

    #[cfg(target_os = "macos")]
    let screenshot_i = MenuItem::with_id(app, "screenshot", "Screenshot", true, None::<&str>)?;
    #[cfg(target_os = "macos")]
    let record_i = MenuItem::with_id(app, "record", "Screen Recording", true, None::<&str>)?;
    #[cfg(target_os = "macos")]
    let reset_perm_i = MenuItem::with_id(app, "reset-permission", "Reset Screen Recording Permission…", true, None::<&str>)?;
    #[cfg(target_os = "macos")]
    state.insert("screenshot", screenshot_i.clone());
    #[cfg(target_os = "macos")]
    state.insert("record", record_i.clone());
    #[cfg(target_os = "macos")]
    state.insert("reset-permission", reset_perm_i.clone());

    let menu = {
        #[cfg(target_os = "macos")]
        {
            Menu::with_items(app, &[
                &screenshot_i,
                &record_i,
                &reset_perm_i,
                &PredefinedMenuItem::separator(app)?,
                &quick_paste_i,
                &show_i,
                &pause_i,
                &PredefinedMenuItem::separator(app)?,
                &quit_i,
            ])?
        }
        #[cfg(not(target_os = "macos"))]
        {
            Menu::with_items(app, &[
                &quick_paste_i,
                &show_i,
                &pause_i,
                &PredefinedMenuItem::separator(app)?,
                &quit_i,
            ])?
        }
    };

    app.manage(state);

    let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        let bytes = include_bytes!("../icons/icon.png");
        let img = image::load_from_memory(bytes).expect("Failed to load fallback tray icon");
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        tauri::image::Image::new_owned(rgba.into_raw(), w, h)
    });
    let _tray = TrayIconBuilder::new()
        .icon(icon)
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
                    // Stop recording by sending SIGINT (same as Ctrl+C in terminal)
                    let pid = RECORDING_PID.swap(0, Ordering::SeqCst);
                    if pid > 0 {
                        let _ = std::process::Command::new("kill")
                            .arg("-INT")
                            .arg(pid.to_string())
                            .status();
                    }
                    return;
                }
                start_screen_recording(app.clone(), record_i.clone());
            }
            #[cfg(target_os = "macos")]
            "reset-permission" => {
                let locale = get_stored_locale();
                let (title, msg, success_msg) = if locale == "zh" {
                    ("重置屏幕录制权限".to_string(), "即将重置屏幕录制权限。重置后需要重新授权。\n\n继续？".to_string(), "✓ 权限已重置。请重新截图或录屏以触发授权弹窗。".to_string())
                } else {
                    ("Reset Screen Recording Permission".to_string(), "This will reset screen recording permission. You will need to re-authorize ABoard.\n\nContinue?".to_string(), "✓ Permission reset. Trigger a screenshot or recording to re-authorize.".to_string())
                };
                let handle = app.clone();
                let _ = app.dialog()
                    .message(&msg)
                    .title(&title)
                    .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
                    .show(move |confirmed| {
                        if confirmed {
                            let _ = std::process::Command::new("tccutil")
                                .args(["reset", "ScreenCapture", "com.aboard.app"])
                                .status();
                            let _ = handle.dialog()
                                .message(&success_msg)
                                .title(&title)
                                .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                                .show(|_| {});
                        }
                    });
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
                let st = app.state::<TrayMenuState>();
                let key = if paused { "resume_monitoring" } else { "pause_monitoring" };
                st.set_text("pause", &get_text(key, &get_stored_locale()));
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
// Locale-aware menu text
// ---------------------------------------------------------------------------

struct TrayTexts {
    screenshot: &'static str,
    screen_recording: &'static str,
    stop_recording: &'static str,
    reset_permission: &'static str,
    quick_paste: &'static str,
    show_window: &'static str,
    pause_monitoring: &'static str,
    resume_monitoring: &'static str,
    quit: &'static str,
}

const TEXTS_ZH: TrayTexts = TrayTexts {
    screenshot: "截图",
    screen_recording: "录屏",
    stop_recording: "停止录屏",
    reset_permission: "重置屏幕录制权限…",
    quick_paste: "快速粘贴",
    show_window: "显示窗口",
    pause_monitoring: "暂停监听",
    resume_monitoring: "恢复监听",
    quit: "退出",
};

const TEXTS_EN: TrayTexts = TrayTexts {
    screenshot: "Screenshot",
    screen_recording: "Screen Recording",
    stop_recording: "Stop Recording",
    reset_permission: "Reset Screen Recording Permission…",
    quick_paste: "Quick Paste",
    show_window: "Show Window",
    pause_monitoring: "Pause Monitoring",
    resume_monitoring: "Resume Monitoring",
    quit: "Quit",
};

fn get_texts(locale: &str) -> &'static TrayTexts {
    match locale {
        "zh" => &TEXTS_ZH,
        _ => &TEXTS_EN,
    }
}

fn get_text(key: &str, locale: &str) -> String {
    let texts = get_texts(locale);
    match key {
        "screenshot" => texts.screenshot.to_string(),
        "screen_recording" => texts.screen_recording.to_string(),
        "stop_recording" => texts.stop_recording.to_string(),
        "reset_permission" => texts.reset_permission.to_string(),
        "quick_paste" => texts.quick_paste.to_string(),
        "show_window" => texts.show_window.to_string(),
        "pause_monitoring" => texts.pause_monitoring.to_string(),
        "resume_monitoring" => texts.resume_monitoring.to_string(),
        "quit" => texts.quit.to_string(),
        _ => key.to_string(),
    }
}

/// Read stored locale from global atomic state.
fn get_stored_locale() -> String {
    if STORED_LOCALE.load(Ordering::Relaxed) == 1 {
        "en".to_string()
    } else {
        "zh".to_string()
    }
}

/// Tauri command: update tray menu texts for the given locale.
/// Called from frontend when locale changes.
#[tauri::command]
pub fn update_tray_locale(app: tauri::AppHandle, locale: String) -> Result<(), String> {
    // Sync global locale for background threads
    STORED_LOCALE.store(if locale == "en" { 1 } else { 0 }, Ordering::Relaxed);

    let state = app.state::<TrayMenuState>();
    let texts = get_texts(&locale);

    #[cfg(target_os = "macos")]
    {
        state.set_text("screenshot", texts.screenshot);
        state.set_text("record", texts.screen_recording);
        state.set_text("reset-permission", texts.reset_permission);
    }

    state.set_text("quick-paste", texts.quick_paste);
    state.set_text("show", texts.show_window);

    // Preserve pause/resume state
    let pause_text = if crate::clipboard::MONITORING_PAUSED.load(Ordering::SeqCst) {
        texts.resume_monitoring
    } else {
        texts.pause_monitoring
    };
    state.set_text("pause", pause_text);
    state.set_text("quit", texts.quit);

    Ok(())
}

// ---------------------------------------------------------------------------
// macOS-only: screenshot and screen recording
// ---------------------------------------------------------------------------

/// Show a one-time permission guidance dialog using the native dialog API.
/// Skips the dialog if screen recording permission is already granted.
#[cfg(target_os = "macos")]
fn show_permission_guide<R: Runtime>(app: &AppHandle<R>) {
    use core_graphics::access::ScreenCaptureAccess;

    static SHOWN: AtomicBool = AtomicBool::new(false);
    if SHOWN.swap(true, Ordering::SeqCst) {
        return;
    }

    // If screen recording permission is already granted, no need to show guidance.
    // Note: CGPreflightScreenCaptureAccess is unreliable in debug/dev builds
    // (always returns false), but works correctly in signed release builds.
    if ScreenCaptureAccess::default().preflight() {
        return;
    }

    let locale = get_stored_locale();
    let (title, msg) = if locale == "zh" {
        ("屏幕录制权限", "ABoard 需要屏幕录制权限。首次使用时 macOS 会弹出系统权限对话框，请允许后重试。\n\n如果权限已开启但仍有问题，请到「系统设置 > 隐私与安全性 > 屏幕录制」中关闭 ABoard 再重新打开。")
    } else {
        ("Screen Recording Permission", "ABoard needs Screen Recording access. macOS will prompt you to grant permission on first use.\n\nIf you already granted it but it still prompts, try toggling ABoard OFF/ON in System Settings > Privacy & Security > Screen Recording.")
    };
    let _ = app.dialog()
        .message(msg)
        .title(title)
        .kind(tauri_plugin_dialog::MessageDialogKind::Info)
        .show(|_| {});
}

#[cfg(target_os = "macos")]
fn capture_screenshot<R: Runtime>(app: AppHandle<R>) {
    show_permission_guide(&app);
    let app_data_dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };
    let data_dir = app_data_dir.join("data");
    let _ = std::fs::create_dir_all(&data_dir);

    let tmp_path = std::env::temp_dir().join(format!("aboard_screenshot_{}.png", uuid::Uuid::new_v4()));

    let result = std::process::Command::new("screencapture")
        .arg("-x")
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
    show_permission_guide(&app);

    RECORDING_ACTIVE.store(true, Ordering::SeqCst);

    // Use locale-aware "Stop Recording" text
    let stop_text = get_text("stop_recording", &get_stored_locale());
    let _ = record_item.set_text(&stop_text);

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
        // -v    : capture video recording of the screen
        // -x    : no shutter sound
        let mut child = match std::process::Command::new("screencapture")
            .arg("-v")
            .arg("-x")
            .arg(&dest_path)
            .spawn()
        {
            Ok(c) => {
                RECORDING_PID.store(c.id(), Ordering::SeqCst);
                c
            }
            Err(_) => {
                RECORDING_ACTIVE.store(false, Ordering::SeqCst);
                let resume_text = get_text("screen_recording", &get_stored_locale());
                let _ = record_item_clone.set_text(&resume_text);
                return;
            }
        };

        let status = child.wait();
        RECORDING_PID.store(0, Ordering::SeqCst);
        RECORDING_ACTIVE.store(false, Ordering::SeqCst);
        let resume_text = get_text("screen_recording", &get_stored_locale());
        let _ = record_item_clone.set_text(&resume_text);

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
