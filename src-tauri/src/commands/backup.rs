use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// 把备份 JSON 内容通过系统「另存为」对话框写到孩子选定的位置。
/// 采用 tmp + rename 原子写；Windows 上 rename 不会覆盖已存在文件，需先删除。
/// 返回最终保存路径；孩子取消对话框时返回 Err("cancelled")。
#[tauri::command]
pub fn export_backup(app: AppHandle, contents: String, default_name: String) -> Result<String, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("CSP 备份", &["json"])
        .set_file_name(&default_name)
        .blocking_save_file();
    let Some(file_path) = file else {
        return Err("cancelled".into());
    };
    let path: PathBuf = match file_path {
        tauri_plugin_dialog::FilePath::Path(p) => p,
        other => PathBuf::from(other.to_string()),
    };

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("写入临时文件失败：{e}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("覆盖旧文件失败：{e}"))?;
    }
    fs::rename(&tmp, &path).map_err(|e| format!("保存失败：{e}"))?;
    Ok(path.to_string_lossy().to_string())
}

/// 弹出系统「打开文件」对话框，读入孩子选定的备份文件内容。
/// 校验逻辑在前端做，这里只负责把原文读回来。
#[tauri::command]
pub fn import_backup(app: AppHandle) -> Result<String, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("CSP 备份", &["json"])
        .blocking_pick_file();
    let Some(file_path) = file else {
        return Err("cancelled".into());
    };
    let path: PathBuf = match file_path {
        tauri_plugin_dialog::FilePath::Path(p) => p,
        other => PathBuf::from(other.to_string()),
    };
    fs::read_to_string(&path).map_err(|e| format!("读取备份文件失败：{e}"))
}
