use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::Stdio,
    time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::render::{Renders, ffmpeg, start_failed};

const MAX_TEXT_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    video_codec: Option<String>,
    pixel_format: Option<String>,
    audio_codecs: Vec<String>,
    duration: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProxyProgress<'a> {
    id: &'a str,
    progress: f64,
}

fn parse_duration(text: &str) -> f64 {
    let Some(value) = text.lines().find_map(|line| line.trim().strip_prefix("Duration: ")) else {
        return 0.0;
    };
    let clock = value.split(',').next().unwrap_or_default();
    clock.split(':').fold(0.0, |total, part| total * 60.0 + part.trim().parse::<f64>().unwrap_or(0.0))
}

fn parse_info(text: &str) -> MediaInfo {
    let streams = || text.lines().filter(|line| line.trim_start().starts_with("Stream #"));
    let after = |line: &str, label: &str| line.split(label).nth(1).map(str::trim).map(String::from);
    let codec = |rest: String| rest.split([' ', ',']).next().unwrap_or_default().to_string();
    let video = streams().find_map(|line| after(line, "Video: "));
    MediaInfo {
        video_codec: video.clone().map(codec),
        pixel_format: video.and_then(|rest| Some(rest.split(',').nth(1)?.trim().split('(').next()?.to_string())),
        audio_codecs: streams().filter_map(|line| after(line, "Audio: ")).map(codec).collect(),
        duration: parse_duration(text),
    }
}

/// With no output named FFmpeg exits with an error, after listing the streams.
#[tauri::command]
pub async fn media_info(path: String) -> Result<MediaInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let output = ffmpeg().args(["-hide_banner", "-i", &path]).output().map_err(start_failed)?;
        Ok(parse_info(&String::from_utf8_lossy(&output.stderr)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A proxy is good for as long as its source file stays the same.
fn proxy_key(path: &Path, mode: &str, stream: Option<u32>) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs());
    let mut hasher = DefaultHasher::new();
    (path, meta.len(), modified, mode, stream).hash(&mut hasher);
    Ok(format!("{:016x}", hasher.finish()))
}

fn proxy_args(source: &str, mode: &str, stream: Option<u32>, copy_audio: bool, target: &Path) -> Vec<String> {
    let mut args: Vec<String> = ["-hide_banner", "-nostdin", "-y", "-v", "error", "-progress", "pipe:1", "-nostats", "-i", source].map(String::from).to_vec();
    let aac = ["-c:a", "aac", "-b:a", "192k"].map(String::from);
    if let Some(stream) = stream {
        args.extend(["-map".into(), format!("0:a:{stream}"), "-vn".into()]);
        args.extend(aac);
    } else {
        args.extend(["-map", "0:v:0", "-map", "0:a:0?"].map(String::from));
        if mode == "transcode" {
            args.extend(["-vf", "scale=-2:'min(720,ih)'", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-pix_fmt", "yuv420p"].map(String::from));
        } else {
            args.extend(["-c:v", "copy"].map(String::from));
        }
        if copy_audio {
            args.extend(["-c:a", "copy"].map(String::from));
        } else {
            args.extend(aac);
        }
        args.extend(["-movflags", "+faststart"].map(String::from));
    }
    args.push(target.to_string_lossy().into_owned());
    args
}

fn make_proxy(app: &AppHandle, renders: &Renders, id: &str, key: &str, args: Vec<String>, duration: f64) -> Result<(), String> {
    let control = renders.track(key)?;
    let result = (|| {
        let mut child = ffmpeg().args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(start_failed)?;
        let stdout = child.stdout.take().ok_or("FFmpeg has no output pipe.")?;
        let stderr = child.stderr.take().ok_or("FFmpeg has no error pipe.")?;
        control.hold(child)?;
        let errors = std::thread::spawn(move || std::io::read_to_string(stderr).unwrap_or_default());
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let done = line.strip_prefix("out_time_us=").and_then(|n| n.trim().parse::<f64>().ok());
            if let (Some(done), true) = (done, duration > 0.0) {
                let _ = app.emit("proxy-progress", ProxyProgress { id, progress: (done / 1_000_000.0 / duration).clamp(0.0, 1.0) });
            }
        }
        control.finish(errors.join().unwrap_or_default())
    })();
    renders.forget(key);
    result
}

/// A copy the webview can play, kept in the cache. Export never reads it, it uses the original.
#[tauri::command]
pub async fn media_proxy(app: AppHandle, renders: State<'_, Renders>, id: String, path: String, mode: String, audio_stream: Option<u32>, copy_audio: bool, duration: f64) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("proxies");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let key = proxy_key(Path::new(&path), &mode, audio_stream)?;
    let extension = if audio_stream.is_some() { "m4a" } else { "mp4" };
    let target = dir.join(format!("{key}.{extension}"));
    if target.is_file() {
        return Ok(target.to_string_lossy().into_owned());
    }
    let partial = dir.join(format!("{key}.part.{extension}"));
    let args = proxy_args(&path, &mode, audio_stream, copy_audio, &partial);
    let renders = (*renders).clone();
    let handle = app.clone();
    let (made, partial_for_task) = (target.clone(), partial.clone());
    tauri::async_runtime::spawn_blocking(move || {
        let result = make_proxy(&handle, &renders, &id, &key, args, duration).and_then(|_| fs::rename(&partial_for_task, &made).map_err(|e| e.to_string()));
        if result.is_err() {
            let _ = fs::remove_file(&partial_for_task);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(target.to_string_lossy().into_owned())
}

/// Integrated loudness in LUFS, or nothing for silence.
#[tauri::command]
pub async fn media_loudness(path: String, audio_stream: Option<u32>, start: f64, duration: f64) -> Result<Option<f64>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let map = format!("0:a:{}", audio_stream.unwrap_or(0));
        let (start, duration) = (format!("{start:.3}"), format!("{duration:.3}"));
        let output = ffmpeg()
            .args(["-hide_banner", "-nostdin", "-ss", &start, "-t", &duration, "-i", &path, "-map", &map, "-af", "loudnorm=print_format=json", "-f", "null", "-"])
            .output()
            .map_err(start_failed)?;
        let text = String::from_utf8_lossy(&output.stderr);
        let line = text.lines().find(|line| line.contains("\"input_i\""));
        Ok(line.and_then(|line| line.split('"').nth(3)?.parse::<f64>().ok()).filter(|v| v.is_finite()))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn recordings_dir(app: &AppHandle, folder: Option<String>) -> Result<PathBuf, String> {
    let dir = match folder {
        Some(folder) => PathBuf::from(folder),
        None => app.path().app_data_dir().map_err(|e| e.to_string())?.join("recordings"),
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The browser's recorder writes a stream with no length in it, which every player then trips on.
#[tauri::command]
pub async fn recording_save(app: AppHandle, folder: Option<String>, name: String, bytes: Vec<u8>) -> Result<String, String> {
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Invalid recording name.".into());
    }
    let dir = recordings_dir(&app, folder)?;
    let raw = dir.join(format!("{name}.webm"));
    let target = dir.join(format!("{name}.m4a"));
    tauri::async_runtime::spawn_blocking(move || {
        fs::write(&raw, bytes).map_err(|e| e.to_string())?;
        let output = ffmpeg().args(["-hide_banner", "-nostdin", "-y", "-v", "error", "-i"]).arg(&raw).args(["-c:a", "aac", "-b:a", "192k"]).arg(&target).output().map_err(start_failed);
        let _ = fs::remove_file(&raw);
        let output = output?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).into_owned());
        }
        Ok(target.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn file_bytes(path: String) -> Result<Vec<u8>, String> {
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_TEXT_BYTES {
        return Err("too-large".into());
    }
    fs::read(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_an_obs_recording() {
        let text = "Input #0, matroska,webm, from 'a.mkv':\n  Duration: 01:02:03.50, start: 0.000000, bitrate: 1 kb/s\n  Stream #0:0: Video: h264 (High), yuv420p(tv, bt709, progressive), 1920x1080\n  Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo\n  Stream #0:2: Audio: opus, 48000 Hz, stereo\n";
        let info = parse_info(text);
        assert_eq!(info.video_codec.as_deref(), Some("h264"));
        assert_eq!(info.pixel_format.as_deref(), Some("yuv420p"));
        assert_eq!(info.audio_codecs, ["aac", "opus"]);
        assert!((info.duration - 3723.5).abs() < 0.01);
    }
}