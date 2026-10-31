mod audio;
mod media;
mod project;
mod render;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(render::Renders::default())
        .invoke_handler(tauri::generate_handler![
            audio::scan_audio,
            media::media_info,
            media::media_proxy,
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