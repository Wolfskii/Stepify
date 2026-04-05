/**
 * Paths for items the user dropped onto the window (folders or files).
 * Uses Electron’s `webUtils.getPathForFile` via preload (Windows / macOS / Linux).
 */
export function pathsFromFileDrop(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer?.files?.length) return []
  const out: string[] = []
  for (let i = 0; i < dataTransfer.files.length; i++) {
    const file = dataTransfer.files[i]
    try {
      out.push(window.electronAPI.getPathForFile(file))
    } catch {
      // Invalid / non-file drop
    }
  }
  return [...new Set(out)]
}
