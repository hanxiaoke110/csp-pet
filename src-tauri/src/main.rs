// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn apply_windows_webview_stability_args() {
    // WebView2 创建共享环境（CreateCoreWebView2EnvironmentWithOptions）时会合并
    // 该环境变量，作用于所有窗口。针对已知故障类：多个透明置顶窗口导致合成器/
    // GPU 进程崩溃、图片消失、整窗卡死（Tauri #8196 / WebView2 GPU crash）。
    // 真机验证：若仍崩溃升级为 "--disable-gpu"；若性能回退明显可移除。
    if std::env::var_os("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_none() {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--disable-gpu-compositing",
        );
    }
}

fn main() {
    #[cfg(target_os = "windows")]
    apply_windows_webview_stability_args();
    csp_desktop_pet_lib::run()
}
