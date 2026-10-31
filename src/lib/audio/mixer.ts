import { useEditor } from "../../store/editor"

/**
 * Preview audio runs through one Web Audio bus so the meter can read it.
 * Every <audio>/<video> in the viewer joins the bus; the bus plays to the
 * speakers unchanged and taps a left and a right analyser on the side.
 */

interface Bus {
  ctx: AudioContext
  input: GainNode
  analysers: [AnalyserNode, AnalyserNode]
}

let bus: Bus | null = null
const gains = new WeakMap<HTMLMediaElement, GainNode>()

function getBus(): Bus {

  if (bus) return bus

  const ctx = new AudioContext()
  const input = ctx.createGain()
  // Mono sources are spread to both sides, so a mono clip lights both channels.
  input.channelCount = 2
  input.channelCountMode = "explicit"
  input.channelInterpretation = "speakers"
  input.connect(ctx.destination)

  const splitter = ctx.createChannelSplitter(2)

  input.connect(splitter)

  const tap = (channel: number) => {

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    splitter.connect(analyser, channel)

    return analyser
  }
  bus = { ctx, input, analysers: [tap(0), tap(1)] }
  return bus
}

/** Sends an element's sound through the bus. The element must load with crossOrigin set, or it plays silence. */
export function routeToBus(el: HTMLMediaElement) {

  if (gains.has(el)) return

  try {

    const { ctx, input } = getBus()
    const gain = ctx.createGain()

    ctx.createMediaElementSource(el).connect(gain).connect(input)
    gains.set(el, gain)
  } catch { } // Without Web Audio the element still plays straight to the speakers; only the meter stays dark.
}

/** An element's own volume stops at 100%, so anything routed is turned up in the bus instead. */
export function setGain(el: HTMLMediaElement, value: number) {

  const gain = gains.get(el)

  if (!gain) {
    el.volume = Math.min(1, Math.max(0, value))
    return
  }

  el.volume = 1
  gain.gain.value = Math.max(0, value)
}

/** A context made before any click starts suspended, and anything routed into it is silent until it resumes. */
function wake() {
  if (bus?.ctx.state === "suspended") void bus.ctx.resume()
}

// Runs inside the click or key press that starts playback, which browsers require for resume().
useEditor.subscribe((s, prev) => {
  if (s.playing && !prev.playing) wake()
})

const scratch = new Float32Array(1024)

/** The sample peak of each side over the last ~20 ms, as linear amplitude. Zero before anything was routed. */
export function readPeaks(out: [number, number]) {

  if (!bus || bus.ctx.state !== "running") {
    out[0] = out[1] = 0
    return out
  }

  bus.analysers.forEach((analyser, side) => {
    analyser.getFloatTimeDomainData(scratch)
    let peak = 0
    for (let i = 0; i < scratch.length; i++) peak = Math.max(peak, Math.abs(scratch[i]))
    out[side] = peak
  })

  return out
}