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
    if !["baseline", "3mf", "stl", "obj", "mtl", "svg", "pdf", "dxf", "png"].contains(&ext(&path).as_str()) { return Err("Dosya türüne izin yok".into()); }
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

// --- sistem fontları: yalnız ad tablosu okunur, dosyanın tamamı değil ---
#[derive(serde::Serialize, Clone)]
struct FontInfo { family: String, style: String, path: String }
fn font_dirs() -> Vec<PathBuf> {
    let mut v = vec![PathBuf::from(std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into())).join("Fonts")];
    if let Ok(l) = std::env::var("LOCALAPPDATA") { v.push(PathBuf::from(l).join(r"Microsoft\Windows\Fonts")); }
    v
}
fn font_names(path: &Path) -> Option<(String, String)> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = fs::File::open(path).ok()?;
    let mut head = [0u8; 12]; f.read_exact(&mut head).ok()?;
    let n = u16::from_be_bytes([head[4], head[5]]) as usize;
    if n == 0 || n > 200 { return None; }
    let mut dir = vec![0u8; n * 16]; f.read_exact(&mut dir).ok()?;
    let rec = (0..n).map(|i| &dir[i * 16..i * 16 + 16]).find(|r| &r[0..4] == b"name")?;
    let off = u32::from_be_bytes([rec[8], rec[9], rec[10], rec[11]]) as u64; let len = u32::from_be_bytes([rec[12], rec[13], rec[14], rec[15]]) as usize;
    if len > 4_000_000 { return None; }
    let mut t = vec![0u8; len]; f.seek(SeekFrom::Start(off)).ok()?; f.read_exact(&mut t).ok()?;
    let u16at = |i: usize| -> Option<u16> { Some(u16::from_be_bytes([*t.get(i)?, *t.get(i + 1)?])) };
    let (count, store) = (u16at(2)? as usize, u16at(4)? as usize);
    let get = |want: u16| -> Option<String> {
        let mut best: Option<(u8, String)> = None;
        for i in 0..count {
            let r = 6 + i * 12; let (pl, lang, id, l, o) = (u16at(r)?, u16at(r + 4)?, u16at(r + 6)?, u16at(r + 8)? as usize, u16at(r + 10)? as usize);
            if id != want { continue; }
            let b = t.get(store + o..store + o + l)?;
            let (score, text) = match pl {
                3 => { let w: Vec<u16> = b.chunks(2).filter(|c| c.len() == 2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect(); (if lang == 0x409 { 3 } else { 2 }, String::from_utf16_lossy(&w)) }
                1 => (1, b.iter().map(|&c| c as char).collect()),
                _ => continue,
            };
            if best.as_ref().map_or(true, |(s, _)| score > *s) { best = Some((score, text)); }
        }
        best.map(|b| b.1).filter(|s| !s.trim().is_empty())
    };
    Some((get(16).or_else(|| get(1))?, get(17).or_else(|| get(2)).unwrap_or_else(|| "Regular".into())))
}
static FONTS: std::sync::OnceLock<Vec<FontInfo>> = std::sync::OnceLock::new();
#[tauri::command]
async fn font_list() -> Vec<FontInfo> {
    FONTS.get_or_init(|| {
        let mut out = Vec::new();
        for d in font_dirs() {
            let Ok(rd) = fs::read_dir(&d) else { continue };
            for e in rd.flatten() {
                let p = e.path();
                if !["ttf", "otf"].contains(&ext(&p).as_str()) { continue; }
                if let Some((family, style)) = font_names(&p) { out.push(FontInfo { family, style, path: p.to_string_lossy().into() }); }
            }
        }
        out.sort_by(|a, b| (a.family.to_lowercase(), a.style.clone()).cmp(&(b.family.to_lowercase(), b.style.clone())));
        out.dedup_by(|a, b| a.family == b.family && a.style == b.style);
        out
    }).clone()
}
#[tauri::command]
fn read_font(path: PathBuf) -> Result<tauri::ipc::Response, String> {
    if !["ttf", "otf"].contains(&ext(&path).as_str()) || !font_dirs().iter().any(|d| path.parent() == Some(d.as_path())) { return Err("Yalnız sistem font klasöründen okunur".into()); }
    fs::read(path).map(tauri::ipc::Response::new).map_err(msg)
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
        .invoke_handler(tauri::generate_handler![read_text, write_file, file_stamp, set_active, mcp_path, read_profile, startup_file, lib_list, lib_read, lib_write, lib_delete, lib_open, font_list, read_font])
        .run(tauri::generate_context!())
        .expect("Baseline başlatılamadı");
}
