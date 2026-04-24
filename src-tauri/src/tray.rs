use tauri::{
    AppHandle, Emitter, Manager, Runtime,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

/// Set up the system tray icon with context menu.
///
/// Menu items:
/// - "Quick Paste": opens the floating quick paste window
/// - "Show Window": brings the main window to front
/// - "Pause/Resume Monitoring": toggles clipboard monitoring state
/// - "Quit": exits the application
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let quick_paste_i = MenuItem::with_id(app, "quick-paste", "Quick Paste", true, None::<&str>)?;
    let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let pause_i = MenuItem::with_id(app, "pause", "Pause Monitoring", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&quick_paste_i, &show_i, &pause_i, &quit_i])?;

    // Clone pause_i so the menu event handler can update its text.
    let pause_item = pause_i.clone();

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("ABoard - Clipboard Manager")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "quick-paste" => {
                if let Some(webview_window) = app.get_webview_window("floating") {
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

/// Set up the macOS application menu bar (the global menu at the top of the screen).
/// On macOS only. Includes: ABoard (About / Settings / Hide / Quit) and Edit submenu.
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

    // Handle menu events
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
