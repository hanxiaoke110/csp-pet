use rusqlite::Connection;

pub fn run(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS player_data (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            coins INTEGER NOT NULL DEFAULT 0,
            active_pet_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS owned_pets (
            pet_id TEXT PRIMARY KEY,
            pet_name TEXT NOT NULL,
            species_id TEXT NOT NULL,
            element TEXT NOT NULL,
            level INTEGER NOT NULL DEFAULT 1,
            exp INTEGER NOT NULL DEFAULT 0,
            exp_to_next INTEGER NOT NULL DEFAULT 100,
            stage INTEGER NOT NULL DEFAULT 1,
            evolution_branch TEXT,
            current_form TEXT NOT NULL,
            hunger INTEGER NOT NULL DEFAULT 100,
            mood INTEGER NOT NULL DEFAULT 80,
            affection INTEGER NOT NULL DEFAULT 50,
            last_fed_at TEXT,
            obtained_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS unlocked_forms (
            pet_id TEXT NOT NULL,
            form_id TEXT NOT NULL,
            unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (pet_id, form_id),
            FOREIGN KEY (pet_id) REFERENCES owned_pets(pet_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pet_inventory (
            item_id TEXT PRIMARY KEY,
            item_type TEXT NOT NULL,
            name TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0,
            effect TEXT
        );

        CREATE TABLE IF NOT EXISTS shop_items (
            item_id TEXT PRIMARY KEY,
            item_type TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            price INTEGER NOT NULL,
            effect TEXT,
            required_level INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS redeemed_codes (
            code TEXT PRIMARY KEY,
            reward_type TEXT NOT NULL,
            reward_data TEXT NOT NULL,
            redeemed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS progress (
            lesson_id TEXT NOT NULL,
            problem_id TEXT NOT NULL,
            status TEXT DEFAULT 'not_started',
            hint_level_reached INTEGER DEFAULT 0,
            completed_at TEXT,
            time_spent_seconds INTEGER DEFAULT 0,
            UNIQUE(lesson_id, problem_id)
        );

        CREATE TABLE IF NOT EXISTS lesson_unlocks (
            lesson_id TEXT PRIMARY KEY,
            unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
            unlock_method TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS course_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Ensure player_data has a row
        INSERT OR IGNORE INTO player_data (id, coins) VALUES (1, 0);

        -- Default shop items
        INSERT OR IGNORE INTO shop_items (item_id, item_type, name, description, price, effect, required_level)
        VALUES
            ('dog_food', 'food', '普通狗粮', '恢复20点饥饿值', 50, '{\"hunger\":20}', 1),
            ('canned_food', 'food', '营养罐头', '恢复50点饥饿值', 120, '{\"hunger\":50}', 1),
            ('feast', 'food', '豪华大餐', '恢复100点饥饿值，心情+10', 250, '{\"hunger\":100,\"mood\":10}', 5),
            ('random_egg', 'egg', '随机宠物蛋', '随机获得一只未拥有的神兽宠物', 200, '{\"egg_type\":\"random\"}', 1),
            ('nine_tail_egg', 'egg', '九尾狐蛋', '获得九尾狐宠物', 500, '{\"egg_type\":\"nine_tail\"}', 10),
            ('yinglong_egg', 'egg', '应龙蛋', '获得应龙宠物', 500, '{\"egg_type\":\"yinglong\"}', 10);"
    ).map_err(|e| format!("Migration failed: {}", e))
}
