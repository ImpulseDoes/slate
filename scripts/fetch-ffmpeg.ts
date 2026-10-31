import { $ } from "bun"
import { createHash } from "node:crypto"
import { chmod, copyFile, exists, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const VERSION = "9.0.2"
// The full build, because automatic captions need its whisper filter.
const BUILD = `ffmpeg-${VERSION}-full_build`
const SHA256 = "f0e46253c70dfe902bac915dfb4224f0cf1b7c6eeab9da2ccc9a5581f9a71b13"
const WINDOWS_BUILD = `https://www.gyan.dev/ffmpeg/builds/packages/${BUILD}.7z`

const root = dirname(import.meta.dir)
const binaries = join(root, "src-tauri", "binaries")
const triple = (await $`rustc -vV`.text()).match(/^host: (.+)$/m)?.[1]?.trim()
if (!triple) throw new Error("Couldn't read the Rust host triple.")

const ext = process.platform === "win32" ? ".exe" : ""
const target = join(binaries, `ffmpeg-${triple}${ext}`)
const stamp = join(binaries, "ffmpeg-build.txt")
const current = await readFile(stamp, "utf8").catch(() => "")
if (await exists(target) && (process.platform !== "win32" || current === BUILD)) process.exit(0)
await mkdir(binaries, { recursive: true })

if (process.platform !== "win32") {
  const system = Bun.which("ffmpeg")
  // Packaged FFmpeg rarely has the whisper filter; automatic captions need scripts/build-ffmpeg.sh.
  if (!system) throw new Error("Install FFmpeg or run scripts/build-ffmpeg.sh, then run this again. Slate copies the one on your PATH.")
  await copyFile(system, target)
  await chmod(target, 0o755)
  console.log(`Copied ${system} to ${target}`)
  process.exit(0)
}

console.log(`Downloading FFmpeg ${VERSION}…`)
const work = await mkdtemp(join(tmpdir(), "slate-ffmpeg-"))
try {
  const archive = join(work, "ffmpeg.7z")
  // curl, because the mirror answers Bun's fetch with a 503. Windows ships it.
  await $`curl -fsSL --retry 3 -o ${archive} ${WINDOWS_BUILD}`
  const hash = createHash("sha256").update(await Bun.file(archive).bytes()).digest("hex")
  if (hash !== SHA256) throw new Error(`Checksum mismatch: got ${hash}`)
  // 7-Zip where it's installed, as on the build servers, whose Windows tar may not open 7z.
  // Otherwise Windows' own tar: Git Bash's reads "C:" as a remote host.
  const sevenZip = Bun.which("7z")
  const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
  if (sevenZip) await $`${sevenZip} x -y -bd -o${work} ${archive}`.quiet()
  else await $`${tar} -xf ${archive} -C ${work}`
  const folder = join(work, BUILD)
  await copyFile(join(folder, "bin", "ffmpeg.exe"), target)
  await copyFile(join(folder, "bin", "ffprobe.exe"), join(binaries, "ffprobe.exe"))
  await copyFile(join(folder, "LICENSE"), join(binaries, "FFMPEG-LICENSE.txt"))
  await writeFile(stamp, BUILD)
  // The archive's dates are older than the last build, and Cargo would keep the sidecar it already copied.
  await utimes(target, new Date(), new Date())
  console.log(`Saved ${target}`)
} finally {
  await rm(work, { recursive: true, force: true })
}