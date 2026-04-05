import { randomUUID } from 'node:crypto'
import { rename as fsRename, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'

function pathsEqualCaseInsensitive(a: string, b: string): boolean {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase()
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

const ILLEGAL_FILENAME_CHARS = new Set('<>:"/\\|?*')

function stripIllegalFilenameChars(s: string): string {
  return [...s]
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0
      if (c < 32 || c === 127) return false
      return !ILLEGAL_FILENAME_CHARS.has(ch)
    })
    .join('')
}

/** Strip characters illegal in Windows filenames; trim trailing dots/spaces (Windows). */
export function sanitizeFilenameSegment(s: string, maxLen: number): string {
  let out = stripIllegalFilenameChars(s).replace(/\s+/g, ' ').trim()
  if (process.platform === 'win32') {
    out = out.replace(/[. ]+$/, '')
  }
  out = out.slice(0, maxLen).trim()
  return out || 'Unknown'
}

export function buildArtistTitleBasename(artist: string, title: string): string {
  const a = sanitizeFilenameSegment(artist, 100)
  const t = sanitizeFilenameSegment(title, 100)
  let base = `${a} - ${t}`
  if (base.length > 180) {
    base = `${base.slice(0, 177)}...`
  }
  return base
}

/**
 * Target path for `Artist - Title.ext` in the same folder; avoids overwriting unrelated files.
 * If the only conflict is the current file (same path ignoring case), returns that path.
 */
export async function resolveRenamedAudioPath(
  oldPath: string,
  desiredBase: string,
  ext: string,
): Promise<string> {
  const dir = dirname(oldPath)
  for (let n = 0; n < 200; n++) {
    const suffix = n === 0 ? '' : ` (${n + 1})`
    const candidate = join(dir, `${desiredBase}${suffix}${ext}`)
    if (pathsEqualCaseInsensitive(candidate, oldPath)) {
      return candidate
    }
    if (!(await pathExists(candidate))) {
      return candidate
    }
  }
  throw new Error('Could not find an available filename in this folder')
}

export async function renameFileCarefully(from: string, to: string): Promise<void> {
  const nf = normalize(from)
  const nt = normalize(to)
  if (nf === nt) return
  if (process.platform === 'win32' && nf.toLowerCase() === nt.toLowerCase()) {
    const tmp = join(dirname(from), `.stepify-rename-${randomUUID()}${extname(from)}`)
    await fsRename(from, tmp)
    await fsRename(tmp, to)
    return
  }
  await fsRename(from, to)
}
