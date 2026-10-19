use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub mod migrations;

pub struct Database {
    pub conn: Mutex<Result<Connection, String>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("csp-db-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
    #[test]
    fn invalid_database_is_not_deleted_or_replaced() {
        let dir = temp_dir();
        let path = dir.join("csp_desktop.db");
        let bytes = b"synthetic damaged database, preserve for recovery";
        std::fs::write(&path, bytes).unwrap();
        assert!(Database::new(dir.clone()).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn normal_reopen_preserves_committed_wallet() {
        let dir = temp_dir();
        {
            let db = Database::new(dir.clone()).unwrap();
            let guard = db.conn.lock().unwrap();
            guard.as_ref().unwrap().execute("INSERT INTO settings VALUES ('pet_data', '12360')", []).unwrap();
        }
        {
            let db = Database::new(dir.clone()).unwrap();
            let guard = db.conn.lock().unwrap();
            let value: String = guard.as_ref().unwrap().query_row("SELECT value FROM settings WHERE key='pet_data'", [], |r| r.get(0)).unwrap();
            assert_eq!(value, "12360");
        }
        std::fs::remove_file(dir.join("csp_desktop.db")).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
    #[test]
    fn locked_database_is_not_replaced_with_an_empty_account() {
        let dir = temp_dir();
        let path = dir.join("csp_desktop.db");
        let holder = Connection::open(&path).unwrap();
        holder.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            INSERT INTO settings VALUES ('pet_data', '12360'); BEGIN EXCLUSIVE;").unwrap();
        assert!(Database::new(dir.clone()).is_err());
        holder.execute_batch("ROLLBACK;").unwrap();
        let value: String = holder.query_row("SELECT value FROM settings WHERE key='pet_data'", [], |r| r.get(0)).unwrap();
        assert_eq!(value, "12360");
        drop(holder);
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;

        let db_path = app_data_dir.join("csp_desktop.db");
        // SQLite owns WAL recovery. Never delete user data on an open error.
        let conn = Self::try_open(&db_path)?;

        Ok(Database {
            conn: Mutex::new(Ok(conn)),
        })
    }

    pub fn unavailable(error: String) -> Self {
        Self { conn: Mutex::new(Err(format!("数据库暂不可用，原文件已保留：{}", error))) }
    }

    fn try_open(db_path: &PathBuf) -> Result<Connection, String> {
        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;
        conn.busy_timeout(std::time::Duration::from_secs(2))
            .map_err(|e| format!("Failed to configure busy timeout: {}", e))?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        // Verify database is operational
        conn.execute_batch("SELECT count(*) FROM sqlite_master;")
            .map_err(|e| format!("Database verification failed: {}", e))?;

        migrations::run(&conn)?;

        Ok(conn)
    }
}
