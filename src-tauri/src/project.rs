use std::{
    ffi::OsString,
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
    time::SystemTime,
};

use tauri::{AppHandle, Manager};

fn write_atomic(path: &Path, contents: &str) -> io::Result<()> {
    let mut temporary = OsString::from(path);
    temporary.push(".tmp");
    let temporary = PathBuf::from(temporary);
    let written = File::create(&temporary).and_then(|mut file| {
        file.write_all(contents.as_bytes())?;
        file.sync_all()
    });
    let result = written.and_then(|_| fs::rename(&temporary, path));
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[tauri::command]
pub fn project_write(path: String, contents: String) -> Result<(), String> {
    write_atomic(Path::new(&path), &contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_read(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn paths_exist(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).is_file()).collect()
}

fn autosave_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("autosave");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Project ids name files here, so nothing but an id's own characters gets through.
fn autosave_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Invalid project id.".into());
    }
    Ok(autosave_dir(app)?.join(format!("{id}.json")))
}

#[tauri::command]
pub fn autosave_write(app: AppHandle, id: String, contents: String) -> Result<(), String> {
    write_atomic(&autosave_path(&app, &id)?, &contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autosave_list(app: AppHandle) -> Result<Vec<String>, String> {
    let mut found: Vec<(SystemTime, PathBuf)> = fs::read_dir(autosave_dir(&app)?)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .filter_map(|entry| Some((entry.metadata().ok()?.modified().ok()?, entry.path())))
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(found.into_iter().filter_map(|(_, path)| fs::read_to_string(path).ok()).collect())
}

#[tauri::command]
pub fn autosave_remove(app: AppHandle, id: String) -> Result<(), String> {
    match fs::remove_file(autosave_path(&app, &id)?) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}
