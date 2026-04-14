use tauri::{
    AppHandle, Manager, Runtime,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

/// Set up the system tray icon with context menu.
///
/// Menu items:
/// - "Show Window": brings the main window to front
/// - "Pause/Resume Monitoring": toggles clipboard monitoring state
/// - "Quit": exits the application
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let pause_i = MenuItem::with_id(app, "pause", "Pause Monitoring", true, None::<&str>)?;
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_i, &pause_i, &quit_i])?;

    // Clone pause_i so the menu event handler can update its text.
    let pause_item = pause_i.clone();

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("ABoard - Clipboard Manager")
        .on_menu_event(move |app, event| match event.id().as_ref() {
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
