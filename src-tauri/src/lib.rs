#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod clipboard;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_global_shortcut::Builder::new().build())?;

            clipboard::start_monitoring(app.handle().clone());
            tray::setup_tray(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![clipboard::toggle_monitoring])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
