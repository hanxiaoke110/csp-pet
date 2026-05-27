use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlayerData {
    pub coins: i64,
    pub active_pet_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OwnedPet {
    pub pet_id: String,
    pub pet_name: String,
    pub species_id: String,
    pub element: String,
    pub level: i64,
    pub exp: i64,
    pub exp_to_next: i64,
    pub stage: i64,
    pub evolution_branch: Option<String>,
    pub current_form: String,
    pub hunger: i64,
    pub mood: i64,
    pub affection: i64,
    pub last_fed_at: Option<String>,
    pub obtained_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UnlockedForm {
    pub pet_id: String,
    pub form_id: String,
    pub unlocked_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InventoryItem {
    pub item_id: String,
    pub item_type: String,
    pub name: String,
    pub quantity: i64,
    pub effect: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ShopItem {
    pub item_id: String,
    pub item_type: String,
    pub name: String,
    pub description: Option<String>,
    pub price: i64,
    pub effect: Option<String>,
    pub required_level: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProblemProgress {
    pub lesson_id: String,
    pub problem_id: String,
    pub status: String,
    pub hint_level_reached: i64,
    pub completed_at: Option<String>,
    pub time_spent_seconds: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LessonUnlock {
    pub lesson_id: String,
    pub unlocked_at: String,
    pub unlock_method: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatSession {
    pub id: String,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub id: Option<i64>,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RedeemedCode {
    pub code: String,
    pub reward_type: String,
    pub reward_data: String,
    pub redeemed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingPair {
    pub key: String,
    pub value: String,
}
