import { ipcMain, type BrowserWindow } from 'electron'
import { loadConfig, saveJsonConfig, saveEnvValue, removeEnvValues } from '../core/config'
import { executeFullPipeline } from '../core/orchestrator'
import type { AppConfig, AutomationProgress, GitHubRepo, IntegrationState } from '../core/types'
import {
  restartScheduler,
  getStatus as getSchedulerStatus,
  onProgressUpdate,
  onStatusChange,
} from './scheduler'
import { startOAuthSlack, startOAuthGithub } from './oauth'

let runAbortController: AbortController | null = null
let isRunning = false

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  onProgressUpdate((progress) => {
    mainWindow.webContents.send('automation:progress', progress)
  })

  onStatusChange((status) => {
    mainWindow.webContents.send('scheduler:tick', status)
  })

  ipcMain.handle('config:get', () => {
    return loadConfig()
  })

  ipcMain.handle('config:save', (_event, config: Partial<AppConfig>) => {
    if (config.remote?.email) saveEnvValue('REMOTE_EMAIL', config.remote.email)
    if (config.remote?.password) saveEnvValue('REMOTE_PASSWORD', config.remote.password)
    if (config.slack?.userToken) saveEnvValue('SLACK_USER_TOKEN', config.slack.userToken)
    if (config.slack?.userId) saveEnvValue('SLACK_USER_ID', config.slack.userId)
    if (config.ai?.openRouterApiKey) saveEnvValue('OPENROUTER_API_KEY', config.ai.openRouterApiKey)

    const jsonParts: Record<string, unknown> = {}
    if (config.remote?.employmentId || config.remote?.timezone) {
      jsonParts.remote = {
        ...(config.remote.employmentId && { employmentId: config.remote.employmentId }),
        ...(config.remote.timezone && { timezone: config.remote.timezone }),
      }
    }
    if (config.github?.repos) jsonParts.github = { repos: config.github.repos }
    if (config.ai?.model || config.ai?.language) {
      jsonParts.ai = {
        ...(config.ai.model && { model: config.ai.model }),
        ...(config.ai.language && { language: config.ai.language }),
      }
    }
    if (config.general) jsonParts.general = config.general
    if (config.scheduler) jsonParts.scheduler = config.scheduler

    if (Object.keys(jsonParts).length > 0) {
      saveJsonConfig(jsonParts)
    }

    if (config.scheduler) {
      restartScheduler()
    }
  })

  ipcMain.handle('test:slack', async () => {
    try {
      const config = loadConfig()
      if (!config.slack.userToken) return { ok: false, error: 'Token not configured' }

      const { WebClient } = await import('@slack/web-api')
      const client = new WebClient(config.slack.userToken)
      const result = await client.auth.test()
      return { ok: result.ok, user: result.user }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('test:git', async () => {
    const config = loadConfig()
    return {
      ok: config.github.repos.length > 0,
      username: config.github.username,
      repoCount: config.github.repos.length,
    }
  })

  ipcMain.handle('test:ai', async () => {
    try {
      const config = loadConfig()
      if (!config.ai.openRouterApiKey) return { ok: false, error: 'API key not configured' }

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${config.ai.openRouterApiKey}` },
      })
      return { ok: response.ok, error: response.ok ? undefined : `HTTP ${response.status}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('integration:state', async (): Promise<IntegrationState> => {
    const config = loadConfig()

    const slack: IntegrationState['slack'] = config.slack.userToken
      ? { status: 'connected', userName: config.slack.userName }
      : { status: 'disconnected' }

    const repoCount = config.github.repos.length
    const github: IntegrationState['github'] = config.github.accessToken
      ? { status: 'connected', username: config.github.username, repoCount }
      : { status: 'disconnected', repoCount: 0 }

    const ai: IntegrationState['ai'] = config.ai.openRouterApiKey
      ? { status: 'connected', model: config.ai.model }
      : { status: 'disconnected' }

    return { slack, github, ai }
  })

  ipcMain.handle('oauth:slack', async () => {
    return startOAuthSlack()
  })

  ipcMain.handle('oauth:github', async () => {
    return startOAuthGithub()
  })

  ipcMain.handle('slack:disconnect', () => {
    removeEnvValues(['SLACK_USER_TOKEN', 'SLACK_USER_ID', 'SLACK_USER_NAME'])
  })

  ipcMain.handle('github:disconnect', () => {
    removeEnvValues(['GITHUB_ACCESS_TOKEN', 'GITHUB_USERNAME'])
  })

  ipcMain.handle('github:repos', async () => {
    try {
      const config = loadConfig()
      if (!config.github.accessToken) {
        return { repos: [], error: 'GitHub not connected' }
      }

      const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: {
          Authorization: `Bearer ${config.github.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!res.ok) {
        return { repos: [], error: `GitHub API error: ${res.status}` }
      }

      const data = await res.json() as Array<{
        owner: { login: string }
        name: string
        full_name: string
        private: boolean
      }>

      return {
        repos: data.map((r) => ({
          owner: r.owner.login,
          name: r.name,
          fullName: r.full_name,
          private: r.private,
        })),
      }
    } catch (error) {
      return { repos: [], error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('github:save-repos', (_event, repos: GitHubRepo[]) => {
    saveJsonConfig({ github: { repos } })
  })

  ipcMain.handle('run:now', async () => {
    if (isRunning) throw new Error('Already running')
    isRunning = true
    runAbortController = new AbortController()

    const sendProgress = (progress: AutomationProgress) => {
      mainWindow.webContents.send('automation:progress', progress)
    }

    try {
      const config = loadConfig()
      const today = new Date().toISOString().slice(0, 10)
      const d = new Date(today)
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      d.setDate(diff)
      const weekStart = d.toISOString().slice(0, 10)

      await executeFullPipeline(weekStart, config, sendProgress)
    } finally {
      isRunning = false
      runAbortController = null
    }
  })

  ipcMain.handle('run:cancel', () => {
    if (runAbortController) {
      runAbortController.abort()
      runAbortController = null
    }
  })

  ipcMain.handle('scheduler:status', () => {
    return getSchedulerStatus()
  })
}
