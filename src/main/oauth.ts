import http from 'http'
import { URL } from 'url'
import { shell } from 'electron'
import { getOAuthCredentials, saveEnvValue } from '../core/config'
import type { SlackOAuthResult, GitHubOAuthResult } from '../core/types'

const SLACK_PORT = 19782
const GITHUB_PORT = 19783
const TIMEOUT_MS = 60_000

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Connected</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0}
.box{text-align:center}.check{font-size:48px;margin-bottom:16px}.msg{font-size:18px;margin-bottom:8px}.sub{font-size:14px;color:#94a3b8}</style></head>
<body><div class="box"><div class="check">✓</div><div class="msg">Connected successfully</div><div class="sub">You can close this tab and return to the app.</div></div>
<script>setTimeout(()=>window.close(),2000)</script></body></html>`

const ERROR_HTML = (msg: string) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Error</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0}
.box{text-align:center}.icon{font-size:48px;margin-bottom:16px}.msg{font-size:18px;margin-bottom:8px;color:#f87171}.sub{font-size:14px;color:#94a3b8}</style></head>
<body><div class="box"><div class="icon">✗</div><div class="msg">${msg}</div><div class="sub">Please close this tab and try again.</div></div></body></html>`

function waitForCallback(port: number): Promise<{ code: string; cleanup: () => void }> {
  return new Promise((resolve, reject) => {
    let settled = false

    const server = http.createServer((req, res) => {
      if (settled) {
        res.writeHead(200)
        res.end()
        return
      }

      const url = new URL(req.url ?? '/', `http://localhost:${port}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        settled = true
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(ERROR_HTML(error))
        cleanup()
        reject(new Error(`OAuth denied: ${error}`))
        return
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(ERROR_HTML('No authorization code received'))
        return
      }

      settled = true
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(SUCCESS_HTML)

      resolve({ code, cleanup })
    })

    const cleanup = () => {
      clearTimeout(timer)
      try { server.close() } catch { }
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error('OAuth timed out — no response within 60 seconds'))
      }
    }, TIMEOUT_MS)

    server.listen(port, '127.0.0.1')

    server.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`Failed to start OAuth server: ${err.message}`))
      }
    })
  })
}

export async function startOAuthSlack(): Promise<SlackOAuthResult> {
  const { clientId, clientSecret } = getOAuthCredentials('slack')
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Slack OAuth credentials not configured in .env' }
  }

  const scopes = 'search:read,channels:history,channels:read,groups:history,groups:read,im:history,mpim:history,users:read'
  const redirectUri = `http://localhost:${SLACK_PORT}/slack/callback`
  const authUrl = `https://slack.com/oauth/v2/authorize?user_scope=${encodeURIComponent(scopes)}&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`

  const callbackPromise = waitForCallback(SLACK_PORT)
  await shell.openExternal(authUrl)

  let code: string
  let cleanup: () => void
  try {
    const result = await callbackPromise
    code = result.code
    cleanup = result.cleanup
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    })

    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    const tokenData = await tokenRes.json() as {
      ok: boolean
      error?: string
      authed_user?: { id: string; access_token: string }
    }

    if (!tokenData.ok || !tokenData.authed_user?.access_token) {
      return { ok: false, error: tokenData.error ?? 'Failed to get access token' }
    }

    const userToken = tokenData.authed_user.access_token
    const userId = tokenData.authed_user.id

    const authRes = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${userToken}` },
    })
    const authData = await authRes.json() as { ok: boolean; user?: string }
    const userName = authData.user ?? ''

    saveEnvValue('SLACK_USER_TOKEN', userToken)
    saveEnvValue('SLACK_USER_ID', userId)
    saveEnvValue('SLACK_USER_NAME', userName)

    return { ok: true, userName, userId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    cleanup!()
  }
}

export async function startOAuthGithub(): Promise<GitHubOAuthResult> {
  const { clientId, clientSecret } = getOAuthCredentials('github')
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'GitHub OAuth credentials not configured in .env (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)' }
  }

  const scopes = 'repo,read:user'
  const redirectUri = `http://localhost:${GITHUB_PORT}/github/callback`
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`

  const callbackPromise = waitForCallback(GITHUB_PORT)
  await shell.openExternal(authUrl)

  let code: string
  let cleanup: () => void
  try {
    const result = await callbackPromise
    code = result.code
    cleanup = result.cleanup
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = await tokenRes.json() as {
      access_token?: string
      error?: string
      error_description?: string
    }

    if (!tokenData.access_token) {
      return { ok: false, error: tokenData.error_description ?? tokenData.error ?? 'Failed to get access token' }
    }

    const accessToken = tokenData.access_token

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })
    const userData = await userRes.json() as { login?: string }
    const username = userData.login ?? ''

    saveEnvValue('GITHUB_ACCESS_TOKEN', accessToken)
    saveEnvValue('GITHUB_USERNAME', username)

    return { ok: true, username }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    cleanup!()
  }
}
