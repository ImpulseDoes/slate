//! Runs FFmpeg for an export. The frontend plans the steps; this side owns the
//! processes, so a render keeps going while the editor does something else.

use std::{
    collections::{HashMap, VecDeque},
    fs,
    io::{BufRead, BufReader},
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
struct Control {
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
}

#[derive(Default)]
pub struct Renders(Mutex<HashMap<String, Arc<Control>>>);

impl Renders {
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
    /// Name inside the scratch folder of what the last step produced.
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

/// The sidecar sits next to the app; a system FFmpeg is the fallback.
fn ffmpeg() -> PathBuf {
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    std::env::current_exe()
        .ok()
        .and_then(|exe| Some(exe.parent()?.join(name)))
        .filter(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from(name))
}

/// No console window, and low priority so the editor stays responsive during a render.
fn background(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const BELOW_NORMAL_PRIORITY: u32 = 0x0000_4000;
        command.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY);
    }
    command
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
    let mut command = Command::new(ffmpeg());
    command.args(args.iter().map(|arg| arg.replace("{work}", &work_text)));
    command.current_dir(work).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = background(&mut command).spawn().map_err(|e| format!("Couldn't start FFmpeg: {e}"))?;
    let stdout = child.stdout.take().ok_or("FFmpeg has no output pipe.")?;
    let stderr = child.stderr.take().ok_or("FFmpeg has no error pipe.")?;
    *control.child.lock().map_err(|e| e.to_string())? = Some(child);
    if control.cancelled.load(Ordering::SeqCst) {
        control.stop();
    }

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

    let child = control.child.lock().map_err(|e| e.to_string())?.take();
    let status = child.ok_or("FFmpeg vanished.")?.wait().map_err(|e| e.to_string())?;
    let errors = errors.join().unwrap_or_default();
    if control.cancelled.load(Ordering::SeqCst) {
        return Err(CANCELLED.into());
    }
    if status.success() {
        return Ok(());
    }
    Err(if errors.is_empty() { format!("FFmpeg stopped: {status}") } else { errors })
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
    let control = Arc::new(Control::default());
    let id = job.id.clone();
    renders.0.lock().map_err(|e| e.to_string())?.insert(id.clone(), control.clone());
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = run(&handle, &job, &control, &work);
        let _ = fs::remove_dir_all(&work);
        result
    })
    .await
    .map_err(|e| e.to_string());
    if let Some(renders) = app.try_state::<Renders>() {
        renders.0.lock().map_err(|e| e.to_string())?.remove(&id);
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

/// Encoders this FFmpeg offers, or an error when there's no FFmpeg at all.
#[tauri::command]
pub async fn render_encoders() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut command = Command::new(ffmpeg());
        command.args(["-hide_banner", "-encoders"]);
        let output = background(&mut command).output().map_err(|e| format!("Couldn't start FFmpeg: {e}"))?;
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

/// What a file holds, as far as a render needs to know.
#[tauri::command]
pub async fn render_probe(path: String) -> Result<StreamInfo, String> {
    const MATRICES: [&str; 5] = ["bt709", "bt470bg", "smpte170m", "smpte240m", "bt2020"];
    tauri::async_runtime::spawn_blocking(move || {
        let mut command = Command::new(ffmpeg());
        command.args(["-hide_banner", "-i", &path]);
        // With no output named FFmpeg exits with an error, after listing the streams.
        let output = background(&mut command).output().map_err(|e| format!("Couldn't start FFmpeg: {e}"))?;
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