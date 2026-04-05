import { extname } from 'node:path'
import NodeID3 from 'node-id3'

export type PicturePayload = {
  buffer: Buffer
  mime: string
}

/**
 * Write common text + optional front cover into MP3 or FLAC. Other extensions are unsupported.
 */
export async function writeAudioFileMetadata(
  absPath: string,
  opts: {
    title?: string
    artist?: string
    album?: string
    picture?: PicturePayload
  },
): Promise<void> {
  const ext = extname(absPath).toLowerCase()

  if (ext === '.mp3') {
    const tags: NodeID3.Tags = {}
    if (opts.title != null) tags.title = opts.title
    if (opts.artist != null) tags.artist = opts.artist
    if (opts.album != null) tags.album = opts.album
    if (opts.picture) {
      tags.image = {
        mime: opts.picture.mime,
        type: { id: 3, name: 'front cover' },
        description: 'Cover',
        imageBuffer: opts.picture.buffer,
      }
    }
    const ok = NodeID3.update(tags, absPath)
    if (ok !== true) {
      const err = ok instanceof Error ? ok.message : String(ok)
      throw new Error(`Failed to write MP3 tags: ${err}`)
    }
    return
  }

  if (ext === '.flac') {
    const { readFlacTags, writeFlacTags } = await import('flac-tagger')
    const existing = await readFlacTags(absPath)
    const tagMap = { ...(existing.tagMap ?? {}) }
    if (opts.title != null) tagMap.title = opts.title
    if (opts.artist != null) tagMap.artist = opts.artist
    if (opts.album != null) tagMap.album = opts.album

    await writeFlacTags(
      {
        ...existing,
        tagMap,
        ...(opts.picture ? { picture: { buffer: opts.picture.buffer } } : {}),
      },
      absPath,
    )
    return
  }

  throw new Error(
    `Writing tags is not supported for ${ext || 'this format'} (supported: .mp3, .flac)`,
  )
}

export function parseDataUrlImage(dataUrl: string): PicturePayload | null {
  const trimmed = dataUrl.trim()
  const lower = trimmed.toLowerCase()
  if (!lower.startsWith('data:')) return null
  const b64Idx = lower.indexOf(';base64,')
  if (b64Idx === -1) return null
  const header = trimmed.slice('data:'.length, b64Idx)
  const mime = header.split(';')[0]?.trim() || 'image/jpeg'
  const b64 = trimmed.slice(b64Idx + ';base64,'.length).replace(/\s/g, '')
  try {
    const buffer = Buffer.from(b64, 'base64')
    if (buffer.length === 0) return null
    return { buffer, mime: mime || 'image/jpeg' }
  } catch {
    return null
  }
}
