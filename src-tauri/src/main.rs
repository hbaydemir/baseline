#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{fs, path::{Path, PathBuf}, time::UNIX_EPOCH};
use tauri::{path::BaseDirectory, AppHandle, Manager};

fn ext(p: &Path) -> String { p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase() }
fn msg(e: impl std::fmt::Display) -> String { e.to_string() }

fn stamp_of(p: &Path) -> Option<String> {
    let m = fs::metadata(p).ok()?;
    let t = m.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_nanos();
    Some(format!("{t}-{}", m.len()))
}

#[tauri::command]
fn read_text(path: PathBuf) -> Result<String, String> {
    if ext(&path) != "baseline" { return Err("Yalnız .baseline okunabilir".into()); }
    fs::read_to_string(path).map_err(msg)
}

#[tauri::command]
fn write_file(path: PathBuf, data: Vec<u8>) -> Result<String, String> {
    if !["baseline", "3mf", "stl", "obj", "mtl"].contains(&ext(&path).as_str()) { return Err("Dosya türüne izin yok".into()); }
    let mut tmp = path.clone().into_os_string();
    tmp.push(".tmp");
    fs::write(&tmp, data).map_err(msg)?;
    fs::rename(&tmp, &path).map_err(msg)?; // yarım dosya kalmasın
    stamp_of(&path).ok_or_else(|| "Dosya damgası okunamadı".into())
}

#[tauri::command]
fn file_stamp(path: PathBuf) -> Option<String> { stamp_of(&path) }

/// Claude/Codex köprüsü açık belgeyi buradan bulur.
#[tauri::command]
fn set_active(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let dir = app.path().home_dir().map_err(msg)?.join(".baseline");
    fs::create_dir_all(&dir).map_err(msg)?;
    fs::write(dir.join("active.json"), serde_json::json!({ "path": path }).to_string()).map_err(msg)
}

#[tauri::command]
fn mcp_path(app: AppHandle) -> Result<String, String> {
    let p = app.path().resolve("ai/mcp.mjs", BaseDirectory::Resource).map_err(msg)?;
    if !p.exists() { return Err("mcp.mjs yok".into()); }
    Ok(p.to_string_lossy().trim_start_matches(r"\\?\").to_string())
}

#[tauri::command]
fn read_profile(kind: String, name: String) -> Result<String, String> {
    if !["machine", "process", "filament"].contains(&kind.as_str()) || name.contains(['/', '\\', ':']) || name.contains("..") { return Err("Geçersiz profil".into()); }
    let root = std::env::var("BAMBU_STUDIO").unwrap_or_else(|_| r"C:\Program Files\Bambu Studio".into());
    let p = Path::new(&root).join("resources/profiles/BBL").join(kind).join(format!("{name}.json"));
    fs::read_to_string(p).map_err(|_| format!("Bambu Studio profili bulunamadı: {name}"))
}

/// Çift tıklanan ya da komut satırında verilen belge.
#[tauri::command]
fn startup_file() -> Option<PathBuf> {
    std::env::args_os().nth(1).map(PathBuf::from).filter(|p| ext(p) == "baseline" && p.exists())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_text, write_file, file_stamp, set_active, mcp_path, read_profile, startup_file])
        .run(tauri::generate_context!())
        .expect("Baseline başlatılamadı");
}
