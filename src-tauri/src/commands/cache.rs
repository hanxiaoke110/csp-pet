//! Clean only old unreferenced question snapshots and explicit download temporaries.
//! Current/previous offline banks, in-flight writes, assets and all saves are protected.
use serde::Serialize;
use std::{
    collections::BTreeSet,
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime},
};
use tauri::Manager;

const ROOTS: &[&str] = &[
    "pet-sprites",
    "collector-cards",
    "wardrobe-assets",
    "question-bank-cache-v2",
];
const TEMP_ROOTS: &[&str] = &[
    "collector-cards",
    "wardrobe-assets",
    "question-bank-cache-v2",
];
// Registered before frontend file writes. Holding this lock during cleanup makes
// "pin then write then publish" safe across all WebViews, including reused hashes.
static QUESTION_WRITES: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
const MIN_AGE: Duration = Duration::from_secs(24 * 60 * 60);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheEntry {
    name: String,
    bytes: u64,
    cleanable_bytes: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheReport {
    entries: Vec<CacheEntry>,
    removed_bytes: u64,
    skipped_files: u64,
    question_cleanup_available: bool,
}

fn plain_relative(path: &Path) -> bool {
    !path.as_os_str().is_empty() && path.components().all(|c| matches!(c, Component::Normal(_)))
}
fn safe_file(base: &Path, relative: &Path) -> bool {
    if !plain_relative(relative) {
        return false;
    }
    let mut path = base.to_path_buf();
    for component in relative.components() {
        path.push(component.as_os_str());
        match fs::symlink_metadata(&path) {
            Ok(meta) if !meta.file_type().is_symlink() => {}
            _ => return false,
        }
    }
    path.canonicalize()
        .map(|p| p.starts_with(base))
        .unwrap_or(false)
}
fn disposable(relative: &Path, meta: &fs::Metadata, now: SystemTime) -> bool {
    let root = relative
        .components()
        .next()
        .and_then(|c| c.as_os_str().to_str())
        .unwrap_or("");
    let name = relative.file_name().and_then(|n| n.to_str()).unwrap_or("");
    TEMP_ROOTS.contains(&root)
        && meta.is_file()
        && (name.ends_with(".download.part") || name.ends_with(".download.tmp"))
        && meta
            .modified()
            .ok()
            .and_then(|m| now.duration_since(m).ok())
            .map(|age| age >= MIN_AGE)
            .unwrap_or(false)
}
fn question_filename(name: &str) -> bool {
    name.len() == 69
        && name.ends_with(".json")
        && name.as_bytes()[..64]
            .iter()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c))
}
fn question_references(raw: Option<&str>) -> Option<BTreeSet<String>> {
    let value: serde_json::Value = serde_json::from_str(raw?).ok()?;
    let slots = value.as_object()?;
    if !slots.contains_key("current")
        || slots
            .keys()
            .any(|key| key != "current" && key != "previous")
    {
        return None;
    }
    let mut files = BTreeSet::new();
    for pointer in slots.values() {
        let file = pointer.get("file")?.as_str()?;
        let hash = pointer.get("hash")?.as_str()?;
        if !question_filename(file) || file != format!("{hash}.json") {
            return None;
        }
        files.insert(file.to_string());
    }
    Some(files)
}
fn obsolete_question(
    relative: &Path,
    meta: &fs::Metadata,
    now: SystemTime,
    protected: &Option<BTreeSet<String>>,
) -> bool {
    let Some(protected) = protected else {
        return false;
    };
    let Some(name) = relative.file_name().and_then(|v| v.to_str()) else {
        return false;
    };
    relative.parent() == Some(Path::new("question-bank-cache-v2"))
        && question_filename(name)
        && !protected.contains(name)
        && meta.is_file()
        && meta
            .modified()
            .ok()
            .and_then(|m| now.duration_since(m).ok())
            .map(|age| age >= MIN_AGE)
            .unwrap_or(false)
}
#[tauri::command]
pub fn protect_question_cache_files(files: Vec<String>) -> Result<(), String> {
    if files.is_empty() || files.len() > 2 || files.iter().any(|file| !question_filename(file)) {
        return Err("题库写入引用无效".into());
    }
    QUESTION_WRITES
        .lock()
        .map_err(|_| "题库缓存保护不可用".to_string())?
        .extend(files);
    Ok(())
}
fn walk(
    base: &Path,
    relative: &Path,
    clean: bool,
    now: SystemTime,
    entry: &mut CacheEntry,
    report: &mut CacheReport,
    depth: usize,
    protected: &Option<BTreeSet<String>>,
) -> Result<(), String> {
    if depth > 8 || !safe_file(base, relative) {
        report.skipped_files += 1;
        return Ok(());
    }
    let path = base.join(relative);
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        for child in fs::read_dir(path).map_err(|e| e.to_string())? {
            let child = child.map_err(|e| e.to_string())?;
            walk(
                base,
                &relative.join(child.file_name()),
                clean,
                now,
                entry,
                report,
                depth + 1,
                protected,
            )?;
        }
    } else if meta.is_file() {
        entry.bytes += meta.len();
        if disposable(relative, &meta, now) || obsolete_question(relative, &meta, now, protected) {
            entry.cleanable_bytes += meta.len();
            if clean {
                // Revalidate immediately before unlink. Never recursively delete a directory.
                let still_eligible = fs::symlink_metadata(&path)
                    .ok()
                    .map(|latest| {
                        disposable(relative, &latest, SystemTime::now())
                            || obsolete_question(relative, &latest, SystemTime::now(), protected)
                    })
                    .unwrap_or(false);
                if safe_file(base, relative) && still_eligible && fs::remove_file(&path).is_ok() {
                    report.removed_bytes += meta.len();
                    entry.bytes -= meta.len();
                    entry.cleanable_bytes -= meta.len();
                } else {
                    report.skipped_files += 1;
                }
            }
        }
    }
    Ok(())
}
fn inspect(
    base: PathBuf,
    clean: bool,
    question_pointers: Option<&str>,
) -> Result<CacheReport, String> {
    let pinned = QUESTION_WRITES
        .lock()
        .map_err(|_| "题库缓存保护不可用".to_string())?;
    let mut report = CacheReport {
        entries: vec![],
        removed_bytes: 0,
        skipped_files: 0,
        question_cleanup_available: false,
    };
    if !base.exists() {
        return Ok(report);
    }
    if fs::symlink_metadata(&base)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("缓存目录不能是链接".into());
    }
    let base = base.canonicalize().map_err(|e| e.to_string())?;
    let mut protected = question_references(question_pointers);
    // Missing referenced offline files are a recovery situation, never grounds
    // for deleting other hash files which may still be useful for recovery.
    if protected.as_ref().is_some_and(|files| {
        files
            .iter()
            .any(|name| !safe_file(&base, &Path::new("question-bank-cache-v2").join(name)))
    }) {
        protected = None;
    }
    report.question_cleanup_available = protected.is_some();
    if let Some(files) = protected.as_mut() {
        files.extend(pinned.iter().cloned());
    }
    for name in ROOTS {
        let mut entry = CacheEntry {
            name: name.to_string(),
            bytes: 0,
            cleanable_bytes: 0,
        };
        if base.join(name).try_exists().map_err(|e| e.to_string())? {
            walk(
                &base,
                Path::new(name),
                clean,
                SystemTime::now(),
                &mut entry,
                &mut report,
                0,
                &protected,
            )?;
        }
        report.entries.push(entry);
    }
    Ok(report)
}
#[tauri::command]
pub async fn inspect_download_cache(
    app: tauri::AppHandle,
    clean: bool,
    question_pointers: Option<String>,
) -> Result<CacheReport, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || inspect(base, clean, question_pointers.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        let p = std::env::temp_dir().join(format!("csp-cache-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn only_old_explicit_download_temporaries_are_candidates() {
        let base = fixture();
        fs::create_dir_all(base.join("collector-cards/card")).unwrap();
        let file = base.join("collector-cards/card/interrupted.download.part");
        fs::write(&file, b"1234").unwrap();
        let meta = fs::metadata(&file).unwrap();
        let future = SystemTime::now() + MIN_AGE + Duration::from_secs(60);
        assert!(disposable(
            Path::new("collector-cards/card/interrupted.download.part"),
            &meta,
            future
        ));
        assert!(!disposable(
            Path::new("collector-cards/card/interrupted.download.part"),
            &meta,
            SystemTime::now()
        ));
        for protected in [
            "pet-sprites/pet.download.part",
            "backups/save.download.part",
            "csp_desktop.db",
            "csp_desktop.db-wal",
            "collector-cards/card/subject.png",
            "question-bank-cache-v2/current.json",
            "wardrobe-assets/a/asset.tmp",
            "diary/a.download.part",
            "focus/a.download.part",
            "wallet/a.download.part",
        ] {
            assert!(
                !disposable(Path::new(protected), &meta, future),
                "{protected}"
            );
        }
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn scan_and_cleanup_preserve_sources_saves_and_recent_downloads() {
        let base = fixture();
        for (name, content) in [
            ("pet-sprites/pet.png", "pet"),
            ("collector-cards/card/asset.png", "asset"),
            ("collector-cards/card/a.download.part", "new"),
            ("backups/save.json", "save"),
            ("csp_desktop.db-wal", "wallet"),
        ] {
            let p = base.join(name);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, content).unwrap();
        }
        let report = inspect(base.clone(), true, None).unwrap();
        assert_eq!(report.removed_bytes, 0);
        assert_eq!(report.entries.iter().map(|e| e.bytes).sum::<u64>(), 11);
        assert!(base.join("backups/save.json").exists());
        assert!(base.join("csp_desktop.db-wal").exists());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn cleans_old_temporary_without_deleting_current_asset() {
        let base = fixture();
        fs::create_dir_all(base.join("wardrobe-assets/a")).unwrap();
        let temp = base.join("wardrobe-assets/a/image.download.part");
        fs::write(&temp, b"old-download").unwrap();
        fs::write(base.join("wardrobe-assets/a/asset.png"), b"keep").unwrap();
        let times = fs::FileTimes::new()
            .set_modified(SystemTime::now() - MIN_AGE - Duration::from_secs(60));
        fs::OpenOptions::new()
            .write(true)
            .open(&temp)
            .unwrap()
            .set_times(times)
            .unwrap();
        let plan = inspect(base.clone(), false, None).unwrap();
        assert_eq!(
            plan.entries.iter().map(|e| e.cleanable_bytes).sum::<u64>(),
            12
        );
        assert!(temp.exists());
        let cleaned = inspect(base.clone(), true, None).unwrap();
        assert_eq!(cleaned.removed_bytes, 12);
        assert!(!temp.exists());
        assert_eq!(
            fs::read(base.join("wardrobe-assets/a/asset.png")).unwrap(),
            b"keep"
        );
        fs::remove_dir_all(base).unwrap();
    }
    fn bank(base: &Path, content: &str, old: bool) -> (String, serde_json::Value) {
        use sha2::{Digest, Sha256};
        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        let name = format!("{hash}.json");
        let path = base.join("question-bank-cache-v2").join(&name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, content).unwrap();
        if old {
            let times = fs::FileTimes::new()
                .set_modified(SystemTime::now() - MIN_AGE - Duration::from_secs(60));
            fs::OpenOptions::new()
                .write(true)
                .open(path)
                .unwrap()
                .set_times(times)
                .unwrap();
        }
        (
            name.clone(),
            serde_json::json!({ "file": name, "hash": hash }),
        )
    }
    #[test]
    fn removes_real_obsolete_hashed_banks_but_keeps_offline_slots_fresh_and_inflight_files() {
        let base = fixture();
        let (current, current_pointer) = bank(&base, r#"{"version":12}"#, true);
        let (previous, previous_pointer) = bank(&base, r#"{"version":11}"#, true);
        let (orphan, _) = bank(&base, r#"{"version":10}"#, true);
        let (fresh, _) = bank(&base, r#"{"version":13}"#, false);
        let (inflight, _) = bank(&base, r#"{"version":14}"#, true);
        protect_question_cache_files(vec![inflight.clone()]).unwrap();
        let raw = serde_json::json!({ "current": current_pointer, "previous": previous_pointer })
            .to_string();
        let plan = inspect(base.clone(), false, Some(&raw)).unwrap();
        assert!(plan.question_cleanup_available);
        assert_eq!(
            plan.entries
                .iter()
                .map(|entry| entry.cleanable_bytes)
                .sum::<u64>(),
            14
        );
        assert!(base.join("question-bank-cache-v2").join(&orphan).exists());
        let result = inspect(base.clone(), true, Some(&raw)).unwrap();
        assert_eq!(result.removed_bytes, 14);
        assert!(!base.join("question-bank-cache-v2").join(orphan).exists());
        for file in [current, previous, fresh, inflight] {
            assert!(base.join("question-bank-cache-v2").join(file).exists());
        }
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn unknown_or_broken_offline_manifest_prevents_question_deletion() {
        let base = fixture();
        let (file, pointer) = bank(&base, r#"{"recoverable":true}"#, true);
        for manifest in [
            None,
            Some("{}"),
            Some("bad-json"),
            Some(r#"{"current":{"file":"../save.json","hash":"a"}}"#),
        ] {
            let result = inspect(base.clone(), true, manifest).unwrap();
            assert!(!result.question_cleanup_available);
            assert_eq!(result.removed_bytes, 0);
        }
        let missing = serde_json::json!({ "current": {"file": format!("{}.json", "f".repeat(64)), "hash": "f".repeat(64)}, "previous": pointer }).to_string();
        let result = inspect(base.clone(), true, Some(&missing)).unwrap();
        assert!(!result.question_cleanup_available);
        assert_eq!(result.removed_bytes, 0);
        assert!(base.join("question-bank-cache-v2").join(file).exists());
        assert!(protect_question_cache_files(vec!["../save.json".into()]).is_err());
        fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn rejects_traversal_and_links() {
        let base = fixture();
        assert!(!safe_file(&base, Path::new("../save")));
        assert!(!safe_file(&base, Path::new("/tmp/save")));
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(std::env::temp_dir(), base.join("collector-cards")).unwrap();
            let report = inspect(base.clone(), true, None).unwrap();
            assert_eq!(report.removed_bytes, 0);
            assert_eq!(report.skipped_files, 1);
            assert!(!safe_file(&base, Path::new("collector-cards")));
        }
        fs::remove_dir_all(base).unwrap();
    }
}
