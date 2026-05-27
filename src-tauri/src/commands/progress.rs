use tauri::State;
use crate::db::{Database, models::ProblemProgress};

#[tauri::command]
pub fn get_progress(db: State<Database>, lesson_id: String, problem_id: String) -> Result<Option<ProblemProgress>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT lesson_id, problem_id, status, hint_level_reached, completed_at, time_spent_seconds FROM progress WHERE lesson_id = ?1 AND problem_id = ?2",
        rusqlite::params![lesson_id, problem_id],
        |row| Ok(ProblemProgress {
            lesson_id: row.get(0)?,
            problem_id: row.get(1)?,
            status: row.get(2)?,
            hint_level_reached: row.get(3)?,
            completed_at: row.get(4)?,
            time_spent_seconds: row.get(5)?,
        }),
    );
    match result {
        Ok(p) => Ok(Some(p)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_progress(db: State<Database>, p: ProblemProgress) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO progress (lesson_id, problem_id, status, hint_level_reached, completed_at, time_spent_seconds) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![p.lesson_id, p.problem_id, p.status, p.hint_level_reached, p.completed_at, p.time_spent_seconds],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_all_progress(db: State<Database>) -> Result<Vec<ProblemProgress>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT lesson_id, problem_id, status, hint_level_reached, completed_at, time_spent_seconds FROM progress"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(ProblemProgress {
        lesson_id: row.get(0)?,
        problem_id: row.get(1)?,
        status: row.get(2)?,
        hint_level_reached: row.get(3)?,
        completed_at: row.get(4)?,
        time_spent_seconds: row.get(5)?,
    })).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn unlock_lesson(db: State<Database>, lesson_id: String, method: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO lesson_unlocks (lesson_id, unlock_method) VALUES (?1, ?2)",
        rusqlite::params![lesson_id, method],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_unlocked_lessons(db: State<Database>) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT lesson_id FROM lesson_unlocks")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(|e| e.to_string())?);
    }
    Ok(ids)
}
