import { extname } from 'node:path'
import NodeID3 from 'node-id3'

/**
 * Writes BPM into embedded tags for supported formats (MP3 ID3 TBPM, FLAC Vorbis BPM).
 * Other extensions return a clear unsupported error without touching the file.
 */
export async function writeBpmToAudioFile(absPath: string, bpm: number): Promise<void> {
  if (!(bpm > 0) || !Number.isFinite(bpm)) {
    throw new Error('Invalid BPM value')
  }

  const ext = extname(absPath).toLowerCase()
  const bpmStr = String(Math.round(bpm))

  if (ext === '.mp3') {
    const ok = NodeID3.update({ bpm: bpmStr }, absPath)
    if (ok !== true) {
      const err = ok instanceof Error ? ok.message : String(ok)
      throw new Error(`Failed to write MP3 tags: ${err}`)
    }
    return
  }

  if (ext === '.flac') {
    const { readFlacTags, writeFlacTags } = await import('flac-tagger')
    const existing = await readFlacTags(absPath)
    const tagMap = { ...(existing.tagMap ?? {}), BPM: bpmStr }
    await writeFlacTags({ ...existing, tagMap }, absPath)
    return
  }

  throw new Error(
    `BPM tag write is not implemented for ${ext || 'this format'}. Supported: .mp3, .flac`,
  )
}
