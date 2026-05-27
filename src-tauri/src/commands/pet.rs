use tauri::State;
use crate::db::{Database, models::*};

#[tauri::command]
pub fn get_player_data(db: State<Database>) -> Result<PlayerData, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT coins, active_pet_id FROM player_data WHERE id = 1",
        [],
        |row| Ok(PlayerData {
            coins: row.get(0)?,
            active_pet_id: row.get(1)?,
        }),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_owned_pets(db: State<Database>) -> Result<Vec<OwnedPet>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT pet_id, pet_name, species_id, element, level, exp, exp_to_next, stage, evolution_branch, current_form, hunger, mood, affection, last_fed_at, obtained_at, updated_at FROM owned_pets"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], |row| Ok(OwnedPet {
        pet_id: row.get(0)?, pet_name: row.get(1)?, species_id: row.get(2)?,
        element: row.get(3)?, level: row.get(4)?, exp: row.get(5)?,
        exp_to_next: row.get(6)?, stage: row.get(7)?, evolution_branch: row.get(8)?,
        current_form: row.get(9)?, hunger: row.get(10)?, mood: row.get(11)?,
        affection: row.get(12)?, last_fed_at: row.get(13)?, obtained_at: row.get(14)?,
        updated_at: row.get(15)?,
    })).map_err(|e| e.to_string())?;

    let mut pets = Vec::new();
    for row in rows { pets.push(row.map_err(|e| e.to_string())?); }
    Ok(pets)
}

#[tauri::command]
pub fn add_pet(db: State<Database>, pet_name: String, species_id: String, element: String, current_form: String) -> Result<String, String> {
    let pet_id = uuid::Uuid::new_v4().to_string();
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO owned_pets (pet_id, pet_name, species_id, element, current_form) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![pet_id, pet_name, species_id, element, current_form],
    ).map_err(|e| e.to_string())?;

    // Set as active if no active pet
    let active: Option<String> = conn.query_row(
        "SELECT active_pet_id FROM player_data WHERE id = 1", [], |row| row.get(0)
    ).ok().flatten();
    if active.is_none() {
        conn.execute("UPDATE player_data SET active_pet_id = ?1 WHERE id = 1", [&pet_id])
            .map_err(|e| e.to_string())?;
    }

    Ok(pet_id)
}

#[tauri::command]
pub fn set_active_pet(db: State<Database>, pet_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE player_data SET active_pet_id = ?1 WHERE id = 1", [&pet_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_pet(db: State<Database>, pet: OwnedPet) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE owned_pets SET pet_name=?1, level=?2, exp=?3, exp_to_next=?4, stage=?5, evolution_branch=?6, current_form=?7, hunger=?8, mood=?9, affection=?10, last_fed_at=?11, updated_at=datetime('now') WHERE pet_id=?12",
        rusqlite::params![pet.pet_name, pet.level, pet.exp, pet.exp_to_next, pet.stage, pet.evolution_branch, pet.current_form, pet.hunger, pet.mood, pet.affection, pet.last_fed_at, pet.pet_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_coins(db: State<Database>, amount: i64) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE player_data SET coins = coins + ?1 WHERE id = 1", [amount])
        .map_err(|e| e.to_string())?;
    let coins: i64 = conn.query_row("SELECT coins FROM player_data WHERE id = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(coins)
}

#[tauri::command]
pub fn spend_coins(db: State<Database>, amount: i64) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let coins: i64 = conn.query_row("SELECT coins FROM player_data WHERE id = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if coins < amount { return Ok(false); }
    conn.execute("UPDATE player_data SET coins = coins - ?1 WHERE id = 1", [amount])
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn get_shop_items(db: State<Database>) -> Result<Vec<ShopItem>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT item_id, item_type, name, description, price, effect, required_level FROM shop_items"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(ShopItem {
        item_id: row.get(0)?, item_type: row.get(1)?, name: row.get(2)?,
        description: row.get(3)?, price: row.get(4)?, effect: row.get(5)?,
        required_level: row.get(6)?,
    })).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for row in rows { items.push(row.map_err(|e| e.to_string())?); }
    Ok(items)
}

#[tauri::command]
pub fn get_inventory(db: State<Database>) -> Result<Vec<InventoryItem>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT item_id, item_type, name, quantity, effect FROM pet_inventory WHERE quantity > 0"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(InventoryItem {
        item_id: row.get(0)?, item_type: row.get(1)?, name: row.get(2)?,
        quantity: row.get(3)?, effect: row.get(4)?,
    })).map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for row in rows { items.push(row.map_err(|e| e.to_string())?); }
    Ok(items)
}

#[tauri::command]
pub fn add_inventory_item(db: State<Database>, item_id: String, item_type: String, name: String, quantity: i64, effect: Option<String>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO pet_inventory (item_id, item_type, name, quantity, effect) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(item_id) DO UPDATE SET quantity = quantity + ?4",
        rusqlite::params![item_id, item_type, name, quantity, effect],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn redeem_code(db: State<Database>, code: String, reward_type: String, reward_data: String) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM redeemed_codes WHERE code = ?1", [&code], |row| row.get::<_, i64>(0)
    ).map(|c| c > 0).map_err(|e| e.to_string())?;
    if exists { return Ok(false); }

    conn.execute(
        "INSERT INTO redeemed_codes (code, reward_type, reward_data) VALUES (?1, ?2, ?3)",
        rusqlite::params![code, reward_type, reward_data],
    ).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn get_unlocked_forms(db: State<Database>, pet_id: String) -> Result<Vec<UnlockedForm>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT pet_id, form_id, unlocked_at FROM unlocked_forms WHERE pet_id = ?1"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([&pet_id], |row| Ok(UnlockedForm {
        pet_id: row.get(0)?, form_id: row.get(1)?, unlocked_at: row.get(2)?,
    })).map_err(|e| e.to_string())?;
    let mut forms = Vec::new();
    for row in rows { forms.push(row.map_err(|e| e.to_string())?); }
    Ok(forms)
}

#[tauri::command]
pub fn unlock_form(db: State<Database>, pet_id: String, form_id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR IGNORE INTO unlocked_forms (pet_id, form_id) VALUES (?1, ?2)",
        rusqlite::params![pet_id, form_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
