import { readFile } from 'node:fs/promises'
import { ipcMain } from 'electron'
import { IPC_AUDIO } from '../../shared/ipc-channels'
import type { IpcResponse } from '../../shared/types'

export function registerAudioIpc(): void {
  ipcMain.handle(
    IPC_AUDIO.READ_FILE,
    async (_event, filePath: string): Promise<IpcResponse<ArrayBuffer>> => {
      try {
        const buffer = await readFile(filePath)
        return { success: true, data: buffer.buffer }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    IPC_AUDIO.GET_METADATA,
    async (_event, filePath: string): Promise<IpcResponse<{ bpm?: number; duration: number }>> => {
      try {
        const { parseFile } = await import('music-metadata')
        const metadata = await parseFile(filePath, { duration: true })
        return {
          success: true,
          data: {
            bpm: metadata.common.bpm ?? undefined,
            duration: metadata.format.duration ?? 0,
          },
        }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    },
  )
}
