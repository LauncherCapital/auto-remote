/// <reference types="vite/client" />

import type { IpcApi } from '../../core/types'

declare global {
  interface Window {
    api: IpcApi
  }
}
