mod db;
mod commands;

use db::Database;
use tauri::Manager;
use tauri::Emitter;
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};

#[tauri::command]
fn toggle_pet_window(app: tauri::AppHandle) -> String {
    if let Some(w) = app.get_webview_window("pet") {
        if w.is_visible().unwrap_or(true) {
            let _ = w.hide();
            "hidden".into()
        } else {
            let _ = w.show();
            "shown".into()
        }
    } else {
        "not_found".into()
    }
}

#[tauri::command]
fn show_pet_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("pet") {
        let _ = w.show();
    }
}

#[tauri::command]
fn hide_pet_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("pet") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn bring_to_front(window: tauri::Window) {
    #[cfg(target_os = "macos")]
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};
        let ns_app: *mut objc::runtime::Object = msg_send![class!(NSApplication), sharedApplication];
        let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
    }
    #[cfg(target_os = "windows")]
    {
        let _ = window.set_focus();
    }
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| e.to_string())?;
            let database = Database::new(app_data_dir)
                .expect("Failed to initialize database");
            app.manage(database);

            // System tray — needed for Windows (close → hide, reopen from tray)
            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "隐藏主窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&hide_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("CSP 学习助手")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bring_to_front,
            toggle_pet_window,
            show_pet_window,
            hide_pet_window,
            // courses
            commands::courses::get_course_version,
            commands::courses::set_course_version,
            // progress
            commands::progress::get_progress,
            commands::progress::save_progress,
            commands::progress::get_all_progress,
            commands::progress::unlock_lesson,
            commands::progress::get_unlocked_lessons,
            // settings
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_all_settings,
            // chat
            commands::chat::create_chat_session,
            commands::chat::get_chat_sessions,
            commands::chat::add_chat_message,
            commands::chat::get_chat_messages,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Prevent close → hide to tray, reopen support
    {
        use tauri::RunEvent;
        app.run(|app_handle, event| {
            match event {
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app_handle.emit("main-window-state", serde_json::json!({ "visible": true }));
                    }
                }
                RunEvent::WindowEvent { label, event: window_event, .. } => {
                    if label == "main" {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = window_event {
                            api.prevent_close();
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.hide();
                                let _ = app_handle.emit("main-window-state", serde_json::json!({ "visible": false }));
                            }
                        }
                    }
                }
                _ => {}
            }
        });
    }
}
