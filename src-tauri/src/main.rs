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

// --- şablonlar ve tasarım havuzu: uygulamayla gelen (app:) ve kullanıcının (user:) klasörü ---
const LIB_EXT: [&str; 6] = ["baseline", "stl", "obj", "3mf", "svg", "png"];
fn user_lib(app: &AppHandle) -> Result<PathBuf, String> { let d = app.path().home_dir().map_err(msg)?.join(".baseline").join("library"); fs::create_dir_all(d.join("Şablonlarım")).map_err(msg)?; fs::create_dir_all(d.join("Tasarımlar")).map_err(msg)?; Ok(d) }
fn lib_root(app: &AppHandle, rel: &str) -> Result<(PathBuf, String), String> {
    let (root, rest) = if let Some(r) = rel.strip_prefix("user:") { (user_lib(app)?, r) } else if let Some(r) = rel.strip_prefix("app:") { (app.path().resolve("library", BaseDirectory::Resource).map_err(msg)?, r) } else { return Err("Geçersiz yol".into()) };
    if rest.split(['/', '\\']).any(|p| p == ".." || p.contains(':')) || rest.starts_with(['/', '\\']) { return Err("Geçersiz yol".into()); }
    Ok((root, rest.to_string()))
}
#[derive(serde::Serialize)]
struct LibFile { path: String, size: u64, modified: u64 }
fn scan(dir: &Path, base: &Path, tag: &str, out: &mut Vec<LibFile>, depth: u32) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() { if depth < 4 { scan(&p, base, tag, out, depth + 1); } continue; }
        if !LIB_EXT.contains(&ext(&p).as_str()) { continue; }
        let m = e.metadata().ok();
        let rel = p.strip_prefix(base).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_default();
        out.push(LibFile { path: format!("{tag}:{rel}"), size: m.as_ref().map(|m| m.len()).unwrap_or(0), modified: m.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0) });
    }
}
#[tauri::command]
fn lib_list(app: AppHandle) -> Result<Vec<LibFile>, String> {
    let mut out = Vec::new();
    if let Ok(d) = app.path().resolve("library", BaseDirectory::Resource) { scan(&d, &d, "app", &mut out, 0); }
    let u = user_lib(&app)?; scan(&u, &u, "user", &mut out, 0);
    Ok(out)
}
#[tauri::command]
fn lib_read(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let (root, rest) = lib_root(&app, &path)?; let p = root.join(rest);
    if !LIB_EXT.contains(&ext(&p).as_str()) { return Err("Dosya türüne izin yok".into()); }
    fs::read(p).map(tauri::ipc::Response::new).map_err(msg)
}
#[tauri::command]
fn lib_write(app: AppHandle, path: String, data: Vec<u8>) -> Result<(), String> {
    if !path.starts_with("user:") { return Err("Yalnız kullanıcı klasörüne yazılır".into()); }
    let (root, rest) = lib_root(&app, &path)?; let p = root.join(rest);
    if !LIB_EXT.contains(&ext(&p).as_str()) { return Err("Dosya türüne izin yok".into()); }
    if let Some(d) = p.parent() { fs::create_dir_all(d).map_err(msg)?; }
    fs::write(p, data).map_err(msg)
}
#[tauri::command]
fn lib_delete(app: AppHandle, path: String) -> Result<(), String> {
    if !path.starts_with("user:") { return Err("Uygulamayla gelen dosya silinemez".into()); }
    let (root, rest) = lib_root(&app, &path)?; let p = root.join(rest);
    if !LIB_EXT.contains(&ext(&p).as_str()) { return Err("Dosya türüne izin yok".into()); }
    fs::remove_file(p).map_err(msg)
}
#[tauri::command]
fn lib_open(app: AppHandle) -> Result<(), String> {
    let d = user_lib(&app)?;
    std::process::Command::new("explorer").arg(d).spawn().map_err(msg)?; Ok(())
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
        .invoke_handler(tauri::generate_handler![read_text, write_file, file_stamp, set_active, mcp_path, read_profile, startup_file, lib_list, lib_read, lib_write, lib_delete, lib_open])
        .run(tauri::generate_context!())
        .expect("Baseline başlatılamadı");
}
