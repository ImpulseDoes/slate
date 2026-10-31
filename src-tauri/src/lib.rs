mod audio;
mod captions;
mod media;
mod project;
mod proxy_cache;
mod render;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(render::Renders::default())
        .setup(|app| {
            let proxies = app.path().app_cache_dir()?.join("proxies");
            std::thread::spawn(move || proxy_cache::trim(&proxies));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            audio::scan_audio,
            captions::model_ready,
            captions::model_download,
            captions::media_transcribe,
            media::media_info,
            media::media_proxy,
            media::media_cached,
            media::media_loudness,
            media::recording_save,
            media::file_bytes,
            project::project_write,
            project::project_read,
            project::paths_exist,
            project::autosave_write,
            project::autosave_list,
            project::autosave_remove,
            render::render_start,
            render::render_cancel,
            render::render_encoders,
            render::render_probe,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // A render is a separate process, so it would outlive the window otherwise.
            if let RunEvent::Exit = event {
                app.state::<render::Renders>().stop_all();
            }
        });
}