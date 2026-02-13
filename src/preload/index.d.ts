import type { ElectronAPI } from '@electron-toolkit/preload'
import type { IpcApi } from '../core/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcApi
  }
}
