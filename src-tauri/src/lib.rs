#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod db;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::Manager;
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let toggle_shortcut =
                    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyV);

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, _shortcut, event| {
                            if event.state() == ShortcutState::Pressed {
                                if let Some(webview_window) = app.get_webview_window("main") {
                                    if webview_window.is_visible().unwrap_or(false) {
                                        let _ = webview_window.hide();
                                    } else {
                                        // Center window on cursor before showing
                                        if let Ok(pos) = webview_window.cursor_position() {
                                            if let Ok(size) = webview_window.inner_size() {
                                                let new_x = pos.x as f64 - size.width as f64 / 2.0;
                                                let new_y = pos.y as f64 - size.height as f64 / 2.0;
                                                let _ = webview_window
                                                    .set_position(tauri::Position::Logical(
                                                        tauri::LogicalPosition::new(new_x, new_y),
                                                    ));
                                            }
                                        }
                                        let _ = webview_window.show();
                                        let _ = webview_window.set_focus();
                                    }
                                }
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut().register(toggle_shortcut)?;
            }

            clipboard::start_monitoring(app.handle().clone());
            tray::setup_tray(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![clipboard::toggle_monitoring])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
