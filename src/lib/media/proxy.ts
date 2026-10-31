export interface MediaInfo {
  videoCodec: string | null
  pixelFormat: string | null
  audioCodecs: string[]
  duration: number
}

/** Remux keeps the picture as it is, transcode makes a small H.264 copy, audio pulls out one sound track. */
export type ProxyMode = "none" | "remux" | "transcode" | "audio"

const PLAYABLE_FILES = ["mp4", "mov", "m4v", "webm"]
const PLAYABLE_VIDEO = ["h264", "vp8", "vp9", "av1"]
const PLAYABLE_AUDIO = ["aac", "mp3", "opus", "vorbis", "flac"]
// Worth trying as they are: a PC with a hardware decoder plays HEVC, and if it doesn't, the import falls back to transcoding.
const COPYABLE_VIDEO = ["h264", "hevc", "av1"]

export function proxyMode(path: string, info: MediaInfo): ProxyMode {

  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  const codec = info.videoCodec ?? ""
  const eightBit = !/10|12/.test(info.pixelFormat ?? "")
  const plainAudio = !info.audioCodecs[0] || PLAYABLE_AUDIO.includes(info.audioCodecs[0])

  if (!codec) return "none"
  if (PLAYABLE_FILES.includes(extension) && PLAYABLE_VIDEO.includes(codec) && eightBit && plainAudio) return "none"

  return COPYABLE_VIDEO.includes(codec) && eightBit ? "remux" : "transcode"
}