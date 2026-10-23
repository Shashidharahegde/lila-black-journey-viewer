// Where a minimap actually has map in it. The images are mostly black off the map (EC-20) and GrandRift's island
// fills only about 60 % of its image, so fitting the whole image leaves the map small. This finds the rows and
// columns that hold real pixels, so the default view can fit those instead. Measured from the image itself.

/** A rectangle as fractions of the image, top = 0. */
export interface ContentBounds {
  left: number
  top: number
  right: number
  bottom: number
}

/** A pixel counts as map when its brightest channel is above this (0–255): the off-map black is 0, map art and its dark vignette are above. */
export const CONTENT_THRESHOLD = 40
/** A row or column counts when at least this many of its pixels are map, so a stray speck doesn't stretch the box. */
export const CONTENT_MIN_PIXELS = 3

export function contentBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = CONTENT_THRESHOLD,
  minPixels = CONTENT_MIN_PIXELS,
): ContentBounds | null {
  const rows = new Uint32Array(height)
  const columns = new Uint32Array(width)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4
      if (Math.max(rgba[k], rgba[k + 1], rgba[k + 2]) > threshold) {
        rows[y]++
        columns[x]++
      }
    }
  }
  const first = (counts: Uint32Array) => counts.findIndex((n) => n >= minPixels)
  const last = (counts: Uint32Array) => counts.findLastIndex((n) => n >= minPixels)
  const top = first(rows)
  const left = first(columns)
  if (top < 0 || left < 0) return null
  return { left: left / width, top: top / height, right: (last(columns) + 1) / width, bottom: (last(rows) + 1) / height }
}

const MEASURE_SIZE = 256

/** Content bounds of a decoded minimap, measured on a small copy of it. */
export function measureContent(image: ImageBitmap): ContentBounds | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = MEASURE_SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, MEASURE_SIZE, MEASURE_SIZE)
  return contentBounds(context.getImageData(0, 0, MEASURE_SIZE, MEASURE_SIZE).data, MEASURE_SIZE, MEASURE_SIZE)
}
