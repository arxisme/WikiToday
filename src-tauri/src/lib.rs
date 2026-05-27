use tauri::Manager;
use std::fs;
use std::path::PathBuf;

fn get_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_bookmarks(app: tauri::AppHandle, bookmarks: serde_json::Value) -> Result<(), String> {
    let mut path = get_app_data_dir(&app)?;
    path.push("bookmarks.json");
    let content = serde_json::to_string(&bookmarks).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_bookmarks(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let mut path = get_app_data_dir(&app)?;
    path.push("bookmarks.json");
    if !path.exists() {
        return Ok(serde_json::Value::Array(Vec::new()));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let val = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(val)
}

#[tauri::command]
fn save_history(app: tauri::AppHandle, history: serde_json::Value) -> Result<(), String> {
    let mut path = get_app_data_dir(&app)?;
    path.push("history.json");
    let content = serde_json::to_string(&history).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_history(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let mut path = get_app_data_dir(&app)?;
    path.push("history.json");
    if !path.exists() {
        return Ok(serde_json::Value::Array(Vec::new()));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let val = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(val)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_bookmarks,
            load_bookmarks,
            save_history,
            load_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
