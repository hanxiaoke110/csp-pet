use tauri::State;
use crate::db::Database;

#[tauri::command]
pub fn get_course_version(db: State<Database>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result: Result<String, _> = conn.query_row(
        "SELECT value FROM course_metadata WHERE key = 'data_version'",
        [],
        |row| row.get(0),
    );
    Ok(result.unwrap_or_default())
}

#[tauri::command]
pub fn set_course_version(db: State<Database>, version: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO course_metadata (key, value) VALUES ('data_version', ?1)",
        [&version],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
