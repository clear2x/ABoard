#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod clipboard;
mod db;
mod tray;

use std::sync::Mutex;
use std::time::Instant;
use tauri::Manager;

/// State for quick-switch cycling through clipboard history.
struct CycleState {
    index: usize,
    last_cycle: Option<Instant>,
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
                                // Quick cycle: Cmd+Shift+J
                                if shortcut == &cycle_shortcut {
                                    let cycle_state = app.state::<Mutex<CycleState>>();
                                    let _ = quick_cycle(app.clone(), cycle_state);
                                }
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut().register(toggle_shortcut)?;
                app.global_shortcut().register(cycle_shortcut)?;
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

            // macOS: set up native application menu bar
            #[cfg(target_os = "macos")]
            {
                tray::setup_app_menu(&app.handle())?;
            }

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
            ai::ai_embedded_load,
            ai::ai_embedded_download,
            db::update_ai_metadata,
            db::update_item_content,
            db::insert_clipboard_item,
            db::semantic_search,
            db::export_items,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
