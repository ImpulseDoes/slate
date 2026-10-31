const onScreen = new Set<HTMLMediaElement>()

/** The clock waits for media on screen, so that picture and playhead set off together. */
export function watchMedia(el: HTMLMediaElement) {

  onScreen.add(el)

  return () => void onScreen.delete(el)
}

export const mediaCatchingUp = () => [...onScreen].some((el) => !el.error && (el.seeking || el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA))