import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('config:save', config),

  oauthSlack: () => ipcRenderer.invoke('oauth:slack'),
  oauthGithub: () => ipcRenderer.invoke('oauth:github'),
  slackDisconnect: () => ipcRenderer.invoke('slack:disconnect'),
  githubDisconnect: () => ipcRenderer.invoke('github:disconnect'),

  githubRepos: () => ipcRenderer.invoke('github:repos'),
  githubSaveRepos: (repos: unknown) => ipcRenderer.invoke('github:save-repos', repos),

  testSlack: () => ipcRenderer.invoke('test:slack'),
  testGithub: () => ipcRenderer.invoke('test:github'),
  testAi: () => ipcRenderer.invoke('test:ai'),

  getIntegrationState: () => ipcRenderer.invoke('integration:state'),

  runNow: () => ipcRenderer.invoke('run:now'),
  cancelRun: () => ipcRenderer.invoke('run:cancel'),

  getSchedulerStatus: () => ipcRenderer.invoke('scheduler:status'),

  onProgress: (callback: (progress: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('automation:progress', handler)
    return () => ipcRenderer.removeListener('automation:progress', handler)
  },

  onSchedulerTick: (callback: (status: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on('scheduler:tick', handler)
    return () => ipcRenderer.removeListener('scheduler:tick', handler)
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error define in dts
  window.electron = electronAPI
  // @ts-expect-error define in dts
  window.api = api
}
