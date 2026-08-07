mod commands;
mod db;

use db::Database;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;

#[tauri::command]
fn toggle_pet_window(app: tauri::AppHandle) -> String {
    if let Some(w) = app.get_webview_window("pet") {
        if w.is_visible().unwrap_or(true) {
            hide_pet_os_window(&w);
            let _ = app.emit(
                "pet-window-visibility",
                serde_json::json!({ "visible": false }),
            );
            "hidden".into()
        } else {
            let _ = w.as_ref().show();
            let _ = w.show();
            ensure_pet_topmost(&app, "pet");
            let _ = app.emit(
                "pet-window-visibility",
                serde_json::json!({ "visible": true }),
            );
            "shown".into()
        }
    } else {
        "not_found".into()
    }
}

/// 隐藏桌宠 OS 窗口。Windows 上【不】调用 WebView2 的 SetIsVisible(false)
/// （v1.7.26~1.7.30 曾用它暂停渲染）：部分机器/运行时上重新激活会静默失败，
/// 窗口冻结成“未响应”幽灵窗（用户反馈：打开→关闭→再打开即现）。
/// OS 层隐藏后 Chromium 页面可见性自动变为 hidden，渲染自然会暂停，
/// 不需要手动暂停合成。
fn hide_pet_os_window(w: &tauri::WebviewWindow) {
    #[cfg(not(target_os = "windows"))]
    let _ = w.as_ref().hide();
    let _ = w.hide();
}

#[tauri::command]
fn show_pet_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("pet") {
        let _ = w.as_ref().show();
        let _ = w.show();
        ensure_pet_topmost(&app, "pet");
        let _ = app.emit(
            "pet-window-visibility",
            serde_json::json!({ "visible": true }),
        );
    }
}

#[tauri::command]
fn hide_pet_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("pet") {
        hide_pet_os_window(&w);
        let _ = app.emit(
            "pet-window-visibility",
            serde_json::json!({ "visible": false }),
        );
    }
}

// v1.7.31 起：多桌面伙伴不再创建独立窗口（Windows 多 WebView2 窗口在部分
// 机器上会整窗卡死，Tauri #8196），改为单一 pet 窗口内渲染多只智子。
// show_desktop_companion / hide_desktop_companion 命令已移除，前端只需更新
// pet_data，pet 窗口通过 pet-data-sync 事件自动增删智子。

/// 把智子窗口重新提到最上层。主窗口获得焦点后调用，
/// 避免智子图层被主窗口盖住（Windows 上直接置 HWND_TOPMOST，
/// macOS 上重新设置 floating 层级）。
fn ensure_pet_topmost(app: &tauri::AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.set_always_on_top(true);
        #[cfg(target_os = "windows")]
        force_windows_topmost(&window);
    }
}

#[cfg(target_os = "windows")]
fn force_windows_topmost(window: &tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
}

/// 主窗口获得焦点后，把智子窗口重新提到最上层，
/// 避免智子图层被主窗口盖住。点击穿透不由 Rust 侧管理：
/// PetWindow 内按光标位置轮询的指针级穿透
/// （只有悬停在精灵本体上才拦截鼠标），Windows/macOS 行为一致。
fn apply_pet_focus_side_effects(app: &tauri::AppHandle, main_focused: bool) {
    if !main_focused {
        return;
    }
    if app.get_webview_window("pet").is_some() {
        ensure_pet_topmost(app, "pet");
    }
}

#[tauri::command]
fn bring_to_front(window: tauri::Window) {
    #[cfg(target_os = "macos")]
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};
        let ns_app: *mut objc::runtime::Object =
            msg_send![class!(NSApplication), sharedApplication];
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second instance launched — focus existing window
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        // 记住主窗口尺寸/位置：启动阶段同步恢复，消除「先大后小」闪烁。
        // pet 窗口由 PetWindow.tsx 自行管理位置，排除避免双重恢复导致跳动。
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["pet", "pet-2", "pet-3"])
                .build(),
        )
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let database = Database::new(app_data_dir).expect("Failed to initialize database");
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
                .on_menu_event(move |app, event| match event.id().as_ref() {
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
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Disable minimize/maximize for pet window (Windows system menu prevention)
            if let Some(pet) = app.get_webview_window("pet") {
                let _ = pet.set_minimizable(false);
                let _ = pet.set_maximizable(false);
            }

            // 兜底：main 窗口 visible:false 由 window-state 插件在 on_window_ready 恢复尺寸后 show。
            // 若插件 restore_state 中途报错（错误被 let _ = 吞）导致 show 未调用，
            // 1.5s 后强制 show，防止窗口卡死隐藏。
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(1500));
                if let Some(w) = app_handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            });

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
            // backup
            commands::backup::export_backup,
            commands::backup::import_backup,
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
        app.run(move |app_handle, event| {
            match event {
                #[cfg(target_os = "macos")]
                RunEvent::Reopen { .. } => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = app_handle
                            .emit("main-window-state", serde_json::json!({ "visible": true }));
                    }
                }
                RunEvent::WindowEvent {
                    label,
                    event: window_event,
                    ..
                } => {
                    if label == "main" || label.starts_with("pet") {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = &window_event {
                            // Windows：主窗口点 X = 真正退出整个应用（含桌宠窗口）。
                            // 之前统一“关闭→隐藏到托盘”，孩子找不到托盘入口，
                            // 只能任务管理器强杀，导致下次启动异常。
                            #[cfg(target_os = "windows")]
                            if label == "main" {
                                if let Some(w) = app_handle.get_webview_window("pet") {
                                    // 只暂停渲染+隐藏，不 destroy：挂死的 WebView2
                                    // 会让 destroy 阻塞，进程退不掉（“软件关不掉”）。
                                    let _ = w.as_ref().hide();
                                    let _ = w.hide();
                                }
                                app_handle.exit(0);
                                return;
                            }
                            api.prevent_close();
                            if let Some(window) = app_handle.get_webview_window(&label) {
                                let _ = window.hide();
                                if label == "pet" {
                                    let _ = app_handle.emit(
                                        "pet-window-visibility",
                                        serde_json::json!({ "visible": false }),
                                    );
                                }
                            }
                        }
                    }
                    if label == "main" {
                        if let tauri::WindowEvent::Focused(focused) = window_event {
                            apply_pet_focus_side_effects(app_handle, focused);
                        }
                    }
                }
                _ => {}
            }
        });
    }
}
