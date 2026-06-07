use rusqlite::Connection;
use std::sync::Mutex;
use std::path::PathBuf;

pub mod migrations;
pub mod models;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;

        let db_path = app_data_dir.join("csp_desktop.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        // Flush stale WAL that may have been left by a crashed/killed previous process.
        // This prevents reads from blocking on corrupted WAL after an unclean shutdown.
        // TRUNCATE mode cleans up the WAL file entirely after checkpoint.
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");

        migrations::run(&conn)?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }
}
