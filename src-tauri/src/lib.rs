#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod clipboard;
mod db;
mod tray;

use tauri::Manager;

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
    Ok(())
}

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
                                if let Some(webview_window) = app.get_webview_window("floating") {
                                    if webview_window.is_visible().unwrap_or(false) {
                                        let _ = webview_window.hide();
                                    } else {
                                        // Center floating window on cursor before showing
                                        if let Ok(pos) = webview_window.cursor_position() {
                                            if let Ok(size) = webview_window.inner_size() {
                                                let new_x =
                                                    pos.x as f64 - size.width as f64 / 2.0;
                                                let new_y =
                                                    pos.y as f64 - size.height as f64 / 2.0;
                                                let _ = webview_window.set_position(
                                                    tauri::Position::Logical(
                                                        tauri::LogicalPosition::new(
                                                            new_x, new_y,
                                                        ),
                                                    ),
                                                );
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

            db::init_db(&app.handle())?;
            ai::init_ai(&app.handle())?;

            // Start AI auto-processing queue
            let processor = ai::processor::start_processor(app.handle().clone());
            app.manage(processor);

            clipboard::start_monitoring(app.handle().clone());
            tray::setup_tray(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            paste_to_active,
            clipboard::toggle_monitoring,
            db::get_history,
            db::search_history,
            db::delete_items,
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
            db::update_ai_metadata,
            db::update_item_content,
            db::insert_clipboard_item,
            db::semantic_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
