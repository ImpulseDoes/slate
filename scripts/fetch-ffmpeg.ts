// Puts the FFmpeg that Slate renders with into src-tauri/binaries, where Tauri
// expects a sidecar. The file is too big for git, so every checkout fetches it once.
import { $ } from "bun"
import { createHash } from "node:crypto"
import { chmod, copyFile, exists, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const VERSION = "9.0.2"
const SHA256 = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba"
const WINDOWS_BUILD = `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-${VERSION}-essentials_build.zip`

const root = dirname(import.meta.dir)
const binaries = join(root, "src-tauri", "binaries")
const triple = (await $`rustc -vV`.text()).match(/^host: (.+)$/m)?.[1]?.trim()
if (!triple) throw new Error("Couldn't read the Rust host triple.")

const ext = process.platform === "win32" ? ".exe" : ""
const target = join(binaries, `ffmpeg-${triple}${ext}`)
if (await exists(target)) process.exit(0)
await mkdir(binaries, { recursive: true })

if (process.platform !== "win32") {
  const system = Bun.which("ffmpeg")
  if (!system) throw new Error("Install FFmpeg first, then run this again. Slate copies the one on your PATH.")
  await copyFile(system, target)
  await chmod(target, 0o755)
  console.log(`Copied ${system} to ${target}`)
  process.exit(0)
}

console.log(`Downloading FFmpeg ${VERSION}…`)
const work = await mkdtemp(join(tmpdir(), "slate-ffmpeg-"))
try {
  const archive = join(work, "ffmpeg.zip")
  // curl, because the mirror answers Bun's fetch with a 503. Windows ships it.
  await $`curl -fsSL --retry 3 -o ${archive} ${WINDOWS_BUILD}`
  const hash = createHash("sha256").update(await Bun.file(archive).bytes()).digest("hex")
  if (hash !== SHA256) throw new Error(`Checksum mismatch: got ${hash}`)
  // Windows' own tar: Git Bash's reads "C:" as a remote host and can't open zips.
  const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
  await $`${tar} -xf ${archive} -C ${work}`
  const folder = join(work, `ffmpeg-${VERSION}-essentials_build`)
  await copyFile(join(folder, "bin", "ffmpeg.exe"), target)
  await copyFile(join(folder, "bin", "ffprobe.exe"), join(binaries, "ffprobe.exe"))
  await copyFile(join(folder, "LICENSE"), join(binaries, "FFMPEG-LICENSE.txt"))
  console.log(`Saved ${target}`)
} finally {
  await rm(work, { recursive: true, force: true })
}
