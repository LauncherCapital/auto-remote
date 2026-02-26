import { shell } from 'electron'
import { saveJsonConfig } from '../core/config'
import type { SlackOAuthResult, GitHubOAuthResult } from '../core/types'

const WEB_URL = 'https://auto-remote.vercel.app'
const TIMEOUT_MS = 300_000 // 5분

// ─── Pending promise resolvers ────────────────────────────────────────────────

let pendingSlack: ((result: SlackOAuthResult) => void) | null = null
let pendingSlackTimer: ReturnType<typeof setTimeout> | null = null

let pendingGithub: ((result: GitHubOAuthResult) => void) | null = null
let pendingGithubTimer: ReturnType<typeof setTimeout> | null = null

// ─── Deep link handler (called from main/index.ts) ───────────────────────────

export function handleDeepLink(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }

  // autoremote://oauth/slack?token=...&userId=...&userName=...
  // autoremote://oauth/github?token=...&username=...&email=...
  const provider = parsed.pathname.replace(/^\//, '') // 'slack' or 'github'

  if (provider === 'slack' && pendingSlack) {
    const token = parsed.searchParams.get('token') ?? ''
    const userId = parsed.searchParams.get('userId') ?? ''
    const userName = parsed.searchParams.get('userName') ?? ''

    if (pendingSlackTimer) clearTimeout(pendingSlackTimer)
    const resolve = pendingSlack
    pendingSlack = null
    pendingSlackTimer = null

    if (!token) {
      resolve({ ok: false, error: 'No token received from web OAuth' })
      return
    }

    saveJsonConfig({ slack: { userToken: token, userId, userName } })
    resolve({ ok: true, userName, userId })
    return
  }

  if (provider === 'github' && pendingGithub) {
    const token = parsed.searchParams.get('token') ?? ''
    const username = parsed.searchParams.get('username') ?? ''
    const authorEmail = parsed.searchParams.get('email') ?? undefined

    if (pendingGithubTimer) clearTimeout(pendingGithubTimer)
    const resolve = pendingGithub
    pendingGithub = null
    pendingGithubTimer = null

    if (!token) {
      resolve({ ok: false, error: 'No token received from web OAuth' })
      return
    }

    saveJsonConfig({
      github: { accessToken: token, username, ...(authorEmail ? { authorEmail } : {}) },
    })
    resolve({ ok: true, username, authorEmail })
  }
}

// ─── OAuth starters ───────────────────────────────────────────────────────────

export function startOAuthSlack(): Promise<SlackOAuthResult> {
  // Cancel any pending OAuth
  if (pendingSlack) {
    pendingSlack({ ok: false, error: 'Cancelled by new OAuth attempt' })
    if (pendingSlackTimer) clearTimeout(pendingSlackTimer)
  }

  return new Promise((resolve) => {
    pendingSlack = resolve

    pendingSlackTimer = setTimeout(() => {
      if (pendingSlack) {
        pendingSlack({ ok: false, error: 'OAuth timed out (5분)' })
        pendingSlack = null
        pendingSlackTimer = null
      }
    }, TIMEOUT_MS)

    shell.openExternal(`${WEB_URL}/api/slack/authorize`)
  })
}

export function startOAuthGithub(): Promise<GitHubOAuthResult> {
  if (pendingGithub) {
    pendingGithub({ ok: false, error: 'Cancelled by new OAuth attempt' })
    if (pendingGithubTimer) clearTimeout(pendingGithubTimer)
  }

  return new Promise((resolve) => {
    pendingGithub = resolve

    pendingGithubTimer = setTimeout(() => {
      if (pendingGithub) {
        pendingGithub({ ok: false, error: 'OAuth timed out (5분)' })
        pendingGithub = null
        pendingGithubTimer = null
      }
    }, TIMEOUT_MS)

    shell.openExternal(`${WEB_URL}/api/github/authorize`)
  })
}
