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
        let wal_path = app_data_dir.join("csp_desktop.db-wal");
        let shm_path = app_data_dir.join("csp_desktop.db-shm");

        // Try to open with WAL recovery
        let conn = Self::try_open(&db_path)
            .or_else(|e| {
                // Don't delete database for transient lock errors
                if e.contains("SQLITE_BUSY") || e.contains("database is locked") {
                    return Err(e);
                }
                // Recovery: delete corrupted WAL/SHM files, retry
                let _ = std::fs::remove_file(&wal_path);
                let _ = std::fs::remove_file(&shm_path);
                Self::try_open(&db_path)
            })
            .or_else(|e| {
                if e.contains("SQLITE_BUSY") || e.contains("database is locked") {
                    return Err(e);
                }
                // Last resort: delete entire database and start fresh
                let _ = std::fs::remove_file(&db_path);
                let _ = std::fs::remove_file(&wal_path);
                let _ = std::fs::remove_file(&shm_path);
                Self::try_open(&db_path)
            })?;

        Ok(Database {
            conn: Mutex::new(conn),
        })
    }

    fn try_open(db_path: &PathBuf) -> Result<Connection, String> {
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        // Flush stale/corrupted WAL left by crashed previous process
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");

        // Verify database is operational
        conn.execute_batch("SELECT count(*) FROM sqlite_master;")
            .map_err(|e| format!("Database verification failed: {}", e))?;

        migrations::run(&conn)?;

        Ok(conn)
    }
}
