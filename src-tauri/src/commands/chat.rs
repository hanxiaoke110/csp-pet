use crate::db::{models::*, Database};
use tauri::State;

#[tauri::command]
pub fn create_chat_session(db: State<Database>, title: Option<String>) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO chat_sessions (id, title) VALUES (?1, ?2)",
        rusqlite::params![id, title],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn get_chat_sessions(db: State<Database>) -> Result<Vec<ChatSession>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ChatSession {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|e| e.to_string())?);
    }
    Ok(sessions)
}

#[tauri::command]
pub fn add_chat_message(
    db: State<Database>,
    session_id: String,
    role: String,
    content: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO chat_messages (session_id, role, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![session_id, role, content],
    )
    .map_err(|e| e.to_string())?;
    // Update session timestamp
    conn.execute(
        "UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?1",
        [&session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_chat_messages(
    db: State<Database>,
    session_id: String,
) -> Result<Vec<ChatMessage>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, session_id, role, content, created_at FROM chat_messages WHERE session_id = ?1 ORDER BY id ASC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&session_id], |row| {
            Ok(ChatMessage {
                id: Some(row.get(0)?),
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: Some(row.get(4)?),
            })
        })
        .map_err(|e| e.to_string())?;
    let mut msgs = Vec::new();
    for row in rows {
        msgs.push(row.map_err(|e| e.to_string())?);
    }
    Ok(msgs)
}
