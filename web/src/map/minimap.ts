// Minimap images, fetched and decoded off the main thread as soon as they are needed,
// instead of waiting for deck.gl to start and load them itself.
import { useEffect, useState } from 'react'

const decoded = new Map<string, Promise<ImageBitmap>>()
/** Decoded maps kept in memory: the current one and the one before (a 4096 px map is ~64 MB decoded). */
const KEEP = 2

export function loadMinimap(url: string): Promise<ImageBitmap> {
  let bitmap = decoded.get(url)
  if (!bitmap) {
    bitmap = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
        return response.blob()
      })
      .then((blob) => createImageBitmap(blob))
    decoded.set(url, bitmap)
    bitmap.catch(() => decoded.delete(url))
  }
  // most recently used last; release the oldest beyond KEEP
  decoded.delete(url)
  decoded.set(url, bitmap)
  for (const [old, promise] of [...decoded].slice(0, Math.max(0, decoded.size - KEEP))) {
    decoded.delete(old)
    promise.then((b) => b.close()).catch(() => {})
  }
  return bitmap
}

/** Downloads a map into the HTTP cache without decoding it, so switching to it later is quick. */
export function prefetchMinimap(url: string): void {
  fetch(url, { priority: 'low' } as RequestInit).catch(() => {})
}

export type MinimapState = { status: 'loading' } | { status: 'ready'; image: ImageBitmap } | { status: 'error'; message: string }

export function useMinimap(url: string): MinimapState {
  const [state, setState] = useState<{ url: string; result: MinimapState }>({ url, result: { status: 'loading' } })
  useEffect(() => {
    let live = true
    loadMinimap(url).then(
      (image) => live && setState({ url, result: { status: 'ready', image } }),
      (error: unknown) => live && setState({ url, result: { status: 'error', message: String(error) } }),
    )
    return () => {
      live = false
    }
  }, [url])
  return state.url === url ? state.result : { status: 'loading' }
}
