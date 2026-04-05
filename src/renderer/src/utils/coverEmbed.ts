/** Longest edge for embedded cover art (balance file size vs. quality). */
const MAX_COVER_SIDE_PX = 1200
const JPEG_QUALITY = 0.88

/**
 * Decode a user-picked image and produce a JPEG data URL suitable for ID3/FLAC embedding.
 * Normalizes WebP/PNG/heavy JPEGs to a widely supported format and bounded size.
 */
export async function fileToCoverEmbedDataUrl(file: File): Promise<string | undefined> {
  let src: ImageBitmap | null = null
  try {
    src = await createImageBitmap(file)
  } catch {
    return undefined
  }

  const { width, height } = src
  if (width < 1 || height < 1) {
    src.close()
    return undefined
  }

  const longest = Math.max(width, height)
  let bitmap = src
  if (longest > MAX_COVER_SIDE_PX) {
    const scale = MAX_COVER_SIDE_PX / longest
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const resized = await createImageBitmap(src, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: 'high',
    }).catch(() => null)
    src.close()
    if (!resized) return undefined
    bitmap = resized
  }

  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return undefined
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  try {
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } catch {
    return undefined
  }
}
