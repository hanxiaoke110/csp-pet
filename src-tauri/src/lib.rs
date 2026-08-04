mod commands;
mod db;

use db::Database;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn toggle_pet_window(app: tauri::AppHandle) -> String {
    if let Some(w) = app.get_webview_window("pet") {
        if w.is_visible().unwrap_or(true) {
            // 先暂停 WebView2 渲染再隐藏 OS 窗口：Windows 上隐藏窗口若继续合成，
            // 会在后台持续 60fps 全帧重绘，是卡顿/资源占用的大头。
            let _ = w.as_ref().hide();
            let _ = w.hide();
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
        let _ = w.as_ref().hide();
        let _ = w.hide();
        let _ = app.emit(
            "pet-window-visibility",
            serde_json::json!({ "visible": false }),
        );
    }
}

fn companion_label(slot: u8) -> Result<String, String> {
    match slot {
        2 | 3 => Ok(format!("pet-{slot}")),
        _ => Err("只支持第 2 或第 3 个桌面智子位置".into()),
    }
}

/// 把某个智子窗口重新提到最上层。主窗口获得焦点后调用，
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

#[tauri::command]
fn show_desktop_companion(app: tauri::AppHandle, slot: u8) -> Result<(), String> {
    let label = companion_label(slot)?;
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.as_ref().show();
        window.show().map_err(|error| error.to_string())?;
        ensure_pet_topmost(&app, &label);
        // 已存在窗口直接显示：同步广播“可见”，避免前端事件注册竞态导致误判回滚
        let _ = app.emit("pet-companion-shown", serde_json::json!({ "slot": slot }));
        return Ok(());
    }

    let x = if slot == 2 { 280.0 } else { 560.0 };
    WebviewWindowBuilder::new(
        &app,
        &label,
        // Slot is derived from the window label on the JS side; keep the URL
        // plain because query strings may not survive the production protocol.
        WebviewUrl::App("pet.html".into()),
    )
    .title(format!("CSP Pet {slot}"))
    .inner_size(260.0, 230.0)
    .position(x, 160.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    // 先隐藏创建，等页面精灵就绪后由 PetWindow show，
    // 消除动态创建透明窗口时的闪白/闪黑。
    .visible(false)
    .build()
    .map_err(|error| format!("创建第 {slot} 个桌面智子窗口失败：{error}"))?;
    Ok(())
}

#[tauri::command]
fn hide_desktop_companion(app: tauri::AppHandle, slot: u8) -> Result<(), String> {
    let label = companion_label(slot)?;
    if let Some(window) = app.get_webview_window(&label) {
        // 收回 = 彻底释放：先暂停 WebView2 渲染，再销毁窗口，
        // 避免隐藏窗口仍在后台 60fps 重绘，也避免残留卡死的渲染进程。
        let _ = window.as_ref().hide();
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// 点击穿透状态的防抖器：主窗口连续焦点变化时（Alt+Tab、连点等），
/// 只按最后一次状态合并应用，避免 Windows 上每次切换都整窗重绘。
#[derive(Default)]
struct PetClickThroughState {
    applied: Option<bool>,
    pending: Option<bool>,
    worker: Option<std::thread::JoinHandle<()>>,
}

fn apply_pet_cursor_state(app: &tauri::AppHandle, ignore: bool) {
    for label in ["pet", "pet-2", "pet-3"] {
        if let Some(pet) = app.get_webview_window(label) {
            let _ = pet.set_ignore_cursor_events(ignore);
            // 主窗口回到前台时同步把智子窗口重新置顶，
            // 保证智子图层始终在主窗口之上。
            ensure_pet_topmost(app, label);
        }
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
            show_desktop_companion,
            hide_desktop_companion,
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
        let pet_cursor_state =
            std::sync::Arc::new(std::sync::Mutex::new(PetClickThroughState::default()));
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
                    // While the main window is focused, make the always-on-top pet
                    // window click-through so it can never swallow clicks meant for
                    // app UI (e.g. the 知识卡 button). Pet interaction resumes as
                    // soon as the main window loses focus.
                    if label == "main" {
                        if let tauri::WindowEvent::Focused(focused) = window_event {
                            let thread_app = app_handle.clone();
                            let thread_state = pet_cursor_state.clone();
                            {
                                let mut state = pet_cursor_state.lock().unwrap();
                                state.pending = Some(focused);
                                if state.worker.is_none() {
                                    state.worker = Some(std::thread::spawn(move || {
                                        loop {
                                            std::thread::sleep(std::time::Duration::from_millis(120));
                                            let next = {
                                                let mut state = thread_state.lock().unwrap();
                                                match state.pending.take() {
                                                    Some(value) => {
                                                        let changed = state.applied != Some(value);
                                                        state.applied = Some(value);
                                                        if changed {
                                                            Some(value)
                                                        } else {
                                                            None
                                                        }
                                                    }
                                                    None => None,
                                                }
                                            };
                                            if let Some(value) = next {
                                                apply_pet_cursor_state(&thread_app, value);
                                            } else {
                                                let mut state = thread_state.lock().unwrap();
                                                if state.pending.is_none() {
                                                    state.worker = None;
                                                    break;
                                                }
                                            }
                                        }
                                    }));
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        });
    }
}
