//! Reads a media file's sound packet by packet to build its waveform, so a
//! file's size only costs time, never memory.

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

    // next_packet ends with an error at end of file, which is how this loop finishes.
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn wav(name: &str, seconds: u32, rate: u32) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(name);
        let count = seconds * rate;
        let mut out = std::io::BufWriter::new(File::create(&path).unwrap());
        out.write_all(b"RIFF").unwrap();
        out.write_all(&(36 + count * 2).to_le_bytes()).unwrap();
        out.write_all(b"WAVEfmt ").unwrap();
        out.write_all(&16u32.to_le_bytes()).unwrap();
        out.write_all(&1u16.to_le_bytes()).unwrap();
        out.write_all(&1u16.to_le_bytes()).unwrap();
        out.write_all(&rate.to_le_bytes()).unwrap();
        out.write_all(&(rate * 2).to_le_bytes()).unwrap();
        out.write_all(&2u16.to_le_bytes()).unwrap();
        out.write_all(&16u16.to_le_bytes()).unwrap();
        out.write_all(b"data").unwrap();
        out.write_all(&(count * 2).to_le_bytes()).unwrap();
        for i in 0..count {
            let v = ((i as f32 * 0.05).sin() * 12000.0) as i16;
            out.write_all(&v.to_le_bytes()).unwrap();
        }
        out.flush().unwrap();
        path
    }

    #[test]
    fn scans_a_wav_into_normalized_peaks() {
        let path = wav("slate-scan-test.wav", 2, 44_100);
        let scan = scan(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert!(scan.has_audio);
        assert!((100..=102).contains(&scan.peaks.len()), "{} peaks", scan.peaks.len());
        assert!(scan.peaks.iter().all(|p| (0.0..=1.0).contains(p)));
        assert!(scan.peaks.iter().any(|p| *p == 1.0));
    }

    #[test]
    fn rejects_a_file_with_no_known_format() {
        let path = std::env::temp_dir().join("slate-scan-junk.mp4");
        std::fs::write(&path, [7u8; 4096]).unwrap();
        let result = scan(&path);
        std::fs::remove_file(&path).unwrap();
        assert!(result.is_err());
    }
}
