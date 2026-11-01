use std::{
    collections::{HashMap, VecDeque},
    ffi::OsStr,
    fs,
    io::{self, BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

const STDERR_LINES: usize = 12;
const CANCELLED: &str = "cancelled";
const EXIT_WAIT: Duration = Duration::from_secs(3);

#[derive(Default)]
pub struct Control {
    cancelled: AtomicBool,
    child: Mutex<Option<Child>>,
}

impl Control {
    fn stop(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Ok(mut child) = self.child.lock() {
            if let Some(child) = child.as_mut() {
                let _ = child.kill();
            }
        }
    }

    /// Keeps a running FFmpeg where `stop` can reach it.
    pub fn hold(&self, child: Child) -> Result<(), String> {
        *self.child.lock().map_err(|e| e.to_string())? = Some(child);
        if self.cancelled.load(Ordering::SeqCst) {
            self.stop();
        }
        Ok(())
    }

    /// Waits for the FFmpeg in `hold` and turns how it ended into a result.
    pub fn finish(&self, errors: String) -> Result<(), String> {
        let child = self.child.lock().map_err(|e| e.to_string())?.take();
        let status = child.ok_or("FFmpeg vanished.")?.wait().map_err(|e| e.to_string())?;
        if self.cancelled.load(Ordering::SeqCst) {
            return Err(CANCELLED.into());
        }
        if status.success() {
            return Ok(());
        }
        Err(if errors.is_empty() { format!("ffmpeg-exit: {status}") } else { errors })
    }
}

#[derive(Clone, Default)]
pub struct Renders(Arc<Mutex<HashMap<String, Arc<Control>>>>);

impl Renders {
    pub fn track(&self, id: &str) -> Result<Arc<Control>, String> {
        let control = Arc::new(Control::default());
        self.0.lock().map_err(|e| e.to_string())?.insert(id.to_string(), control.clone());
        Ok(control)
    }

    pub fn forget(&self, id: &str) {
        if let Ok(mut running) = self.0.lock() {
            running.remove(id);
        }
    }

    pub fn stop_all(&self) {
        if let Ok(running) = self.0.lock() {
            running.values().for_each(|control| control.stop());
        }
        // Each render clears its scratch folder on the way out, and the app is about to exit.
        let deadline = Instant::now() + EXIT_WAIT;
        while self.0.lock().is_ok_and(|running| !running.is_empty()) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(20));
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderJob {
    id: String,
    /// One FFmpeg command line per step. `{work}` stands for the job's scratch folder.
    steps: Vec<Vec<String>>,
    files: Vec<WorkFile>,
    result: String,
    output: String,
}

#[derive(Deserialize)]
pub struct WorkFile {
    name: String,
    text: Option<String>,
    bytes: Option<Vec<u8>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    id: &'a str,
    step: usize,
    frame: u64,
}

pub fn ffmpeg() -> Command {
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    let sidecar = std::env::current_exe().ok().and_then(|exe| Some(exe.parent()?.join(name))).filter(|path| path.is_file());
    hidden(sidecar.unwrap_or_else(|| PathBuf::from(name)))
}

/// A helper program with no console window, in the background behind the editor.
pub fn hidden(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const BELOW_NORMAL_PRIORITY: u32 = 0x0000_4000;
        command.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY);
    }
    command
}

pub fn start_failed(error: io::Error) -> String {
    format!("ffmpeg-start: {error}")
}

/// Scratch space beside the output, so the finished file only has to be renamed.
fn work_dir(id: &str, output: &Path) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Invalid render id.".into());
    }
    let parent = output.parent().ok_or("That output folder doesn't exist.")?;
    Ok(parent.join(format!(".slate-render-{id}")))
}

fn write_files(work: &Path, files: &[WorkFile]) -> Result<(), String> {
    for file in files {
        if Path::new(&file.name).file_name().is_none_or(|name| name != file.name.as_str()) {
            return Err(format!("Invalid file name: {}", file.name));
        }
        let bytes = file.text.as_ref().map(|t| t.as_bytes()).or(file.bytes.as_deref()).unwrap_or_default();
        fs::write(work.join(&file.name), bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn run_step(app: &AppHandle, id: &str, step: usize, args: &[String], work: &Path, control: &Control) -> Result<(), String> {
    let work_text = work.to_string_lossy();
    let mut child = ffmpeg()
        .args(args.iter().map(|arg| arg.replace("{work}", &work_text)))
        .current_dir(work)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(start_failed)?;
    let stdout = child.stdout.take().ok_or("FFmpeg has no output pipe.")?;
    let stderr = child.stderr.take().ok_or("FFmpeg has no error pipe.")?;
    control.hold(child)?;

    // Read this on its own thread: a full error pipe would stall FFmpeg.
    let errors = thread::spawn(move || {
        let mut tail = VecDeque::with_capacity(STDERR_LINES);
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if tail.len() == STDERR_LINES {
                tail.pop_front();
            }
            tail.push_back(line);
        }
        tail.into_iter().collect::<Vec<_>>().join("\n")
    });

    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if let Some(frame) = line.strip_prefix("frame=").and_then(|n| n.trim().parse().ok()) {
            let _ = app.emit("render-progress", Progress { id, step, frame });
        }
    }

    control.finish(errors.join().unwrap_or_default())
}

fn run(app: &AppHandle, job: &RenderJob, control: &Control, work: &Path) -> Result<(), String> {
    fs::create_dir_all(work).map_err(|e| e.to_string())?;
    write_files(work, &job.files)?;
    for (step, args) in job.steps.iter().enumerate() {
        run_step(app, &job.id, step, args, work, control)?;
    }
    fs::rename(work.join(&job.result), &job.output).map_err(|e| e.to_string())
}

/// Resolves when the render ends. An error of "cancelled" means the user stopped it.
#[tauri::command]
pub async fn render_start(app: AppHandle, renders: State<'_, Renders>, job: RenderJob) -> Result<(), String> {
    let work = work_dir(&job.id, Path::new(&job.output))?;
    let id = job.id.clone();
    let control = renders.track(&id)?;
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = run(&handle, &job, &control, &work);
        let _ = fs::remove_dir_all(&work);
        result
    })
    .await
    .map_err(|e| e.to_string());
    if let Some(renders) = app.try_state::<Renders>() {
        renders.forget(&id);
    }
    result?
}

#[tauri::command]
pub fn render_cancel(renders: State<'_, Renders>, id: String) -> Result<(), String> {
    if let Some(control) = renders.0.lock().map_err(|e| e.to_string())?.get(&id) {
        control.stop();
    }
    Ok(())
}

#[tauri::command]
pub async fn render_encoders() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = ffmpeg().args(["-hide_banner", "-encoders"]).output().map_err(start_failed)?;
        let text = String::from_utf8_lossy(&output.stdout);
        Ok(text.lines().filter_map(|line| line.split_whitespace().nth(1).map(String::from)).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    has_audio: bool,
    color_tagged: bool,
}

#[tauri::command]
pub async fn render_probe(path: String) -> Result<StreamInfo, String> {
    const MATRICES: [&str; 5] = ["bt709", "bt470bg", "smpte170m", "smpte240m", "bt2020"];
    tauri::async_runtime::spawn_blocking(move || {
        // With no output named FFmpeg exits with an error, after listing the streams.
        let output = ffmpeg().args(["-hide_banner", "-i", &path]).output().map_err(start_failed)?;
        let text = String::from_utf8_lossy(&output.stderr);
        let streams = || text.lines().filter(|line| line.contains("Stream #"));
        Ok(StreamInfo {
            has_audio: streams().any(|line| line.contains("Audio:")),
            color_tagged: streams().any(|line| line.contains("Video:") && MATRICES.iter().any(|m| line.contains(m))),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CopyInfo {
    width: u32,
    height: u32,
    rate_num: u64,
    rate_den: u64,
    /// Only where a copy can start or end cleanly.
    keyframes: Vec<Keyframe>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Keyframe {
    /// Seconds from the start the way `-ss` counts them, exactly where the packet sits.
    at: f64,
    /// The same moment on the frame grid. Matroska keeps whole milliseconds, which wobble around it.
    time: f64,
}

const RATES: [(u64, u64); 14] = [(24000, 1001), (24, 1), (25, 1), (30000, 1001), (30, 1), (48, 1), (50, 1), (60000, 1001), (60, 1), (100, 1), (120000, 1001), (120, 1), (144, 1), (240, 1)];

/// Size and start time of an H.264 recording in 8-bit 4:2:0 at limited range, the only kind an export can take as it is.
fn copyable(header: &str) -> Option<(u32, u32, f64)> {
    let video = header.lines().find(|line| line.contains("Stream #") && line.contains("Video: "))?;
    let details = video.split("Video: ").nth(1)?;
    let pixel = details.split(',').nth(1)?.trim();
    if !details.starts_with("h264") || !(pixel == "yuv420p" || pixel.starts_with("yuv420p(")) || pixel.starts_with("yuv420p(pc") {
        return None;
    }
    let start = header
        .lines()
        .find_map(|line| line.split("start: ").nth(1))
        .and_then(|rest| rest.split(',').next()?.trim().parse::<f64>().ok())
        .unwrap_or(0.0);
    let (width, height) = details.split(',').find_map(|part| {
        let (w, h) = part.split_whitespace().next()?.split_once('x')?;
        Some((w.parse().ok()?, h.parse().ok()?))
    })?;
    Some((width, height, start))
}

/// Whether the recording can be copied into an export, and from which keyframes: it must run at
/// a standard rate with no frame dropped, and a keyframe counts only if it starts a closed group.
fn copy_info(header: &str, packets: &str) -> Option<CopyInfo> {
    let (width, height, start) = copyable(header)?;
    let (tb_num, tb_den) = packets.lines().find_map(|line| line.strip_prefix("#tb 0: "))?.trim().split_once('/')?;
    let tb = tb_num.parse::<f64>().ok()? / tb_den.parse::<f64>().ok()?;
    // stream, dts, pts, duration, size, crc[, F=flags]: the flags are left out for a plain keyframe.
    let list: Vec<(i64, bool)> = packets
        .lines()
        .filter(|line| line.starts_with("0,"))
        .filter_map(|line| {
            let fields: Vec<&str> = line.split(',').map(str::trim).collect();
            let flags = fields.get(6).and_then(|f| f.strip_prefix("F=0x")).map_or(Some(1), |hex| i64::from_str_radix(hex, 16).ok())?;
            Some((fields.get(2)?.parse().ok()?, flags & 1 == 1))
        })
        .collect();
    let mut shown: Vec<i64> = list.iter().map(|p| p.0).collect();
    shown.sort_unstable();
    let (first, last) = (*shown.first()?, *shown.last()?);
    if shown.len() < 2 || last == first {
        return None;
    }
    let measured = (shown.len() - 1) as f64 / ((last - first) as f64 * tb);
    let off = |&(n, d): &(u64, u64)| ((n as f64 / d as f64) / measured - 1.0).abs();
    let &(num, den) = RATES.iter().min_by(|a, b| off(a).total_cmp(&off(b))).filter(|rate| off(rate) < 0.002)?;
    let rate = num as f64 / den as f64;
    let frame_of = |pts: i64| (pts - first) as f64 * tb * rate;
    if shown.iter().enumerate().any(|(i, &pts)| (frame_of(pts) - i as f64).abs() > 0.4) {
        return None;
    }
    let keyframes = list
        .iter()
        .enumerate()
        .filter(|(i, p)| p.1 && list[i + 1..].iter().take_while(|q| !q.1).all(|q| q.0 > p.0))
        .map(|(_, p)| Keyframe { at: p.0 as f64 * tb - start, time: first as f64 * tb - start + frame_of(p.0).round() / rate })
        .collect();
    Some(CopyInfo { width, height, rate_num: num, rate_den: den, keyframes })
}

#[tauri::command]
pub async fn render_copy_info(path: String) -> Result<Option<CopyInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let header = ffmpeg().args(["-hide_banner", "-i", &path]).output().map_err(start_failed)?;
        let header = String::from_utf8_lossy(&header.stderr).into_owned();
        if copyable(&header).is_none() {
            return Ok(None);
        }
        // Reads every packet without decoding any, so even an hour of video takes seconds.
        let packets = ffmpeg().args(["-hide_banner", "-v", "error", "-i", &path, "-map", "0:v:0", "-c", "copy", "-f", "framecrc", "-"]).output().map_err(start_failed)?;
        Ok(copy_info(&header, &String::from_utf8_lossy(&packets.stdout)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_clean_keyframes() {
        let header = "  Duration: 00:00:10.00, start: 0.000000, bitrate: 1 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1280x720 [SAR 1:1 DAR 16:9], 60 fps\n";
        let packets = "#tb 0: 1/15360\n0, -512, 0, 256, 1, 0x1\n0, -256, 512, 256, 1, 0x2, F=0x0\n0, 0, 256, 256, 1, 0x3, F=0x0\n0, 256, 1024, 256, 1, 0x4\n0, 512, 768, 256, 1, 0x5, F=0x0\n0, 768, 1280, 256, 1, 0x6, F=0x0\n";
        let info = copy_info(header, packets).unwrap();
        assert_eq!((info.width, info.height, info.rate_num, info.rate_den), (1280, 720, 60, 1));
        // The second keyframe has a frame shown before it that's decoded after it: an open group.
        assert_eq!(info.keyframes, vec![Keyframe { at: 0.0, time: 0.0 }]);
        assert!(copy_info(&header.replace("h264", "hevc"), packets).is_none());
        assert!(copy_info(&header.replace("yuv420p(tv", "yuv420p(pc"), packets).is_none());
    }

    #[test]
    fn reads_matroska_milliseconds() {
        let header = "  Duration: 00:00:10.00, start: 0.000000, bitrate: 1 kb/s\n  Stream #0:0: Video: h264 (High), yuv420p(tv, bt709, progressive), 1920x1080, 60 fps\n";
        let pts: Vec<i64> = (0..120).map(|i| (i as f64 * 1000.0 / 60.0).round() as i64).collect();
        let packets: String = std::iter::once("#tb 0: 1/1000\n".to_string())
            .chain(pts.iter().enumerate().map(|(i, p)| format!("0, {p}, {p}, 17, 1, 0x0{}\n", if i % 60 == 0 { "" } else { ", F=0x0" })))
            .collect();
        let info = copy_info(header, &packets).unwrap();
        assert_eq!((info.rate_num, info.rate_den), (60, 1));
        assert_eq!(info.keyframes.len(), 2);
        assert_eq!(info.keyframes[1].at, 1.0);
        assert!((info.keyframes[1].time - 1.0).abs() < 1e-9);
    }
}