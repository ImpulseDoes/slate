use std::{fs::File, path::Path};

use serde::Serialize;
use symphonia::core::{
    audio::SampleBuffer,
    codecs::{CODEC_TYPE_NULL, DecoderOptions},
    errors::Error,
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};

/// Must match PEAKS_PER_SECOND in src/types.ts.
const PEAKS_PER_SECOND: u32 = 50;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioScan {
    has_audio: bool,
    /// Empty when the track exists but can't be decoded here (Opus, for one).
    peaks: Vec<f32>,
}

#[tauri::command]
pub async fn scan_audio(path: String) -> Result<AudioScan, String> {
    tauri::async_runtime::spawn_blocking(move || scan(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

fn scan(path: &Path) -> Result<AudioScan, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let probed = symphonia::default::get_probe()
        .format(&hint, stream, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| e.to_string())?;
    let mut format = probed.format;

    // Video tracks report a null codec, so the first real codec is the sound.
    let Some(track) = format.tracks().iter().find(|t| t.codec_params.codec != CODEC_TYPE_NULL) else {
        return Ok(AudioScan { has_audio: false, peaks: Vec::new() });
    };
    let track_id = track.id;
    let rate = track.codec_params.sample_rate.unwrap_or(48_000);
    let Ok(mut decoder) = symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default()) else {
        return Ok(AudioScan { has_audio: true, peaks: Vec::new() });
    };

    let bucket = (rate / PEAKS_PER_SECOND).max(1);
    let mut peaks = Vec::new();
    let mut peak = 0f32;
    let mut filled = 0;
    let mut samples: Option<SampleBuffer<f32>> = None;

    while let Ok(packet) = format.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(Error::DecodeError(_)) => continue,
            Err(_) => break,
        };
        let spec = *decoded.spec();
        let channels = spec.channels.count().max(1);
        let frames = decoded.capacity();
        if samples.as_ref().is_none_or(|b| b.capacity() < frames * channels) {
            samples = Some(SampleBuffer::new(frames as u64, spec));
        }
        let Some(buffer) = samples.as_mut() else { break };
        buffer.copy_interleaved_ref(decoded);

        for frame in buffer.samples().chunks(channels) {
            peak = frame.iter().fold(peak, |max, s| max.max(s.abs()));
            filled += 1;
            if filled == bucket {
                peaks.push(peak);
                peak = 0.0;
                filled = 0;
            }
        }
    }
    if filled > 0 {
        peaks.push(peak);
    }

    let max = peaks.iter().copied().fold(0f32, f32::max);
    if max > 0.0 {
        for p in &mut peaks {
            *p = (*p / max * 1000.0).round() / 1000.0;
        }
    }
    Ok(AudioScan { has_audio: true, peaks })
}