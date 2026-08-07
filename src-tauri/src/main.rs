// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 注：v1.7.26~1.7.30 曾注入 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=
    // --disable-gpu-compositing 缓解多透明窗口崩溃；v1.7.31 起多宠改为单一
    // 窗口渲染，该 workaround 已移除（强制软件合成对全屏透明窗口反而是性能负担）。
    csp_desktop_pet_lib::run()
}
