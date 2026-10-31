use std::{
    fs::{self, File},
    io::{self, Read},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::media::{Progress, run_ffmpeg};
use crate::render::{Renders, ffmpeg, hidden};

const MODEL: &str = "ggml-base.bin";
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
const MODEL_BYTES: u64 = 147_951_465;
const MODEL_SHA256: &str = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe";
const PROGRESS_EVERY: Duration = Duration::from_millis(250);
// Longer than any stretch it's given, so it hears each one whole, at the end of the file.
const LISTEN_SECONDS: u32 = 60;
const EVENT: &str = "captions-progress";

fn model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("models"))
}

fn sha256(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut chunk = vec![0; 1024 * 1024];
    loop {
        let read = file.read(&mut chunk)?;
        if read == 0 {
            return Ok(hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect());
        }
        hasher.update(&chunk[..read]);
    }
}

#[tauri::command]
pub fn model_ready(app: AppHandle) -> Result<bool, String> {
    let path = model_dir(&app)?.join(MODEL);
    Ok(fs::metadata(path).is_ok_and(|meta| meta.len() == MODEL_BYTES))
}

/// Downloads to one side and keeps what arrived, so a dropped connection or a cancel picks up where it stopped.
#[tauri::command]
pub async fn model_download(app: AppHandle, renders: State<'_, Renders>, id: String) -> Result<(), String> {
    let dir = model_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (partial, target) = (dir.join(format!("{MODEL}.part")), dir.join(MODEL));
    let renders = (*renders).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let control = renders.track(&id)?;
        let result = (|| {
            let failed = |e: io::Error| format!("model-download: {e}");
            let mut child = hidden("curl")
                .args(["-fLsS", "--retry", "5", "--retry-all-errors", "-C", "-", "-o"])
                .arg(&partial)
                .arg(MODEL_URL)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(failed)?;
            let stderr = child.stderr.take().ok_or("curl has no error pipe.")?;
            control.hold(child)?;
            let errors = thread::spawn(move || io::read_to_string(stderr).unwrap_or_default());
            let done = Arc::new(AtomicBool::new(false));
            let watcher = {
                let (done, partial, app, id) = (done.clone(), partial.clone(), app.clone(), id.clone());
                thread::spawn(move || {
                    while !done.load(Ordering::SeqCst) {
                        let bytes = fs::metadata(&partial).map(|meta| meta.len()).unwrap_or(0);
                        let _ = app.emit(EVENT, Progress { id: &id, progress: bytes as f64 / MODEL_BYTES as f64 });
                        thread::sleep(PROGRESS_EVERY);
                    }
                })
            };
            let finished = control.finish(errors.join().unwrap_or_default());
            done.store(true, Ordering::SeqCst);
            let _ = watcher.join();
            finished.map_err(|error| if error == "cancelled" { error } else { format!("model-download: {error}") })?;
            if sha256(&partial).map_err(failed)? != MODEL_SHA256 {
                let _ = fs::remove_file(&partial);
                return Err("model-download: the file arrived damaged.".to_string());
            }
            fs::rename(&partial, &target).map_err(failed)
        })();
        renders.forget(&id);
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The speech in part of a file, as SRT with times counted from `start`.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn media_transcribe(app: AppHandle, renders: State<'_, Renders>, id: String, path: String, audio_stream: Option<u32>, start: f64, duration: f64, language: String, width: u32) -> Result<String, String> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') || !language.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err("Invalid transcription request.".into());
    }
    let dir = model_dir(&app)?;
    let renders = (*renders).clone();
    tauri::async_runtime::spawn_blocking(move || {
        let output = dir.join(format!("{id}.srt"));
        // Plain names, run from the model's folder: a Windows path's colon would end the filter's option.
        let filter = format!("whisper=model={MODEL}:language={language}:queue={LISTEN_SECONDS}:max_len={width}:destination={id}.srt:format=srt");
        let map = format!("0:a:{}", audio_stream.unwrap_or(0));
        let mut command = ffmpeg();
        command.current_dir(&dir);
        command.args(["-hide_banner", "-nostdin", "-y", "-v", "error", "-progress", "pipe:1", "-nostats", "-ss", &format!("{start:.3}"), "-t", &format!("{duration:.3}"), "-i", &path, "-map", &map, "-af", &filter, "-f", "null", "-"]);
        let result = run_ffmpeg(&app, &renders, EVENT, &id, &id, &mut command, duration);
        let text = fs::read(&output).map(|bytes| String::from_utf8_lossy(&bytes).into_owned()).unwrap_or_default();
        let _ = fs::remove_file(&output);
        result.map(|_| text)
    })
    .await
    .map_err(|e| e.to_string())?
}