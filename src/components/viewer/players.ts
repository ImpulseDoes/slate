import type { Clip } from "../../types"

/**
 * Which player shows each clip near the playhead, as a React key. A clip keeps its player until it
 * leaves, and the next piece of the same recording takes a free one: a seek, not loading the file again.
 */
export function assignPlayers(previous: Map<string, string>, clips: Clip[]) {

  const players = new Map<string, string>()
  const taken = new Set<string>()

  for (const clip of clips) {

    const kept = previous.get(clip.id)

    if (kept) {
      players.set(clip.id, kept)
      taken.add(kept)
    }
  }

  for (const clip of clips) {

    if (players.has(clip.id)) continue

    let slot = 0

    while (taken.has(`${clip.mediaId}:${slot}`)) slot++

    const player = clip.mediaId ? `${clip.mediaId}:${slot}` : clip.id

    players.set(clip.id, player)
    taken.add(player)
  }
  return players
}