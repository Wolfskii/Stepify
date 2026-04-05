/**
 * Resolve the library folder display name for a local file path.
 * Picks the longest matching root so nested library dirs resolve correctly.
 */
export function folderLabelForTrackPath(
  localPath: string | undefined,
  libraryRootPaths: readonly string[],
): string {
  if (!localPath || libraryRootPaths.length === 0) return '—'

  const norm = (p: string) => p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

  const filePath = norm(localPath)
  let bestRaw: string | null = null
  let bestLen = -1

  for (const rootRaw of libraryRootPaths) {
    const root = norm(rootRaw)
    if (!root) continue
    const under = filePath === root || filePath.startsWith(`${root}/`)
    if (under && root.length > bestLen) {
      bestLen = root.length
      bestRaw = rootRaw.trim()
    }
  }

  if (bestRaw == null) return '—'

  const trimmed = bestRaw.replace(/[/\\]+$/, '')
  const sep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const name = sep >= 0 ? trimmed.slice(sep + 1) : trimmed
  return name || '—'
}
