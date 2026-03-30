import { createServer } from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { exec } from 'child_process'

const OAUTH_PORT = 7421
const VERCEL_BASE = 'https://auto-remote.vercel.app'

export interface SlackOAuthData {
  token: string
  userId: string
  userName: string
}

export interface GitHubOAuthData {
  token: string
  username: string
}

function openBrowser(url: string): void {
  exec(`open "${url}"`)
}

function isValidCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function waitForCallback(provider: 'slack' | 'github'): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('OAuth 시간 초과 (2분). 다시 시도하세요.'))
    }, 120_000)

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost:${OAUTH_PORT}`)

      if (url.pathname !== `/oauth/${provider}`) {
        res.writeHead(404)
        res.end()
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center}.icon{font-size:3rem;color:#4ade80;margin-bottom:1rem}p{color:#94a3b8;margin-top:.5rem}</style></head>
<body><div><div class="icon">✓</div><h1>${provider === 'slack' ? 'Slack' : 'GitHub'} 연결 완료</h1><p>터미널로 돌아가세요.</p></div></body></html>`)

      clearTimeout(timeout)
      server.close()

      const params: Record<string, string> = {}
      url.searchParams.forEach((value, key) => {
        params[key] = value
      })
      resolve(params)
    })

    server.listen(OAUTH_PORT, 'localhost', () => {
      const callbackUrl = `http://localhost:${OAUTH_PORT}/oauth/${provider}`
      if (!isValidCallbackUrl(callbackUrl)) {
        reject(new Error('잘못된 콜백 URL'))
        return
      }
      const authorizeUrl = `${VERCEL_BASE}/api/${provider}/authorize?callback=${encodeURIComponent(callbackUrl)}`
      openBrowser(authorizeUrl)
      console.log(`\n브라우저가 열립니다. 인증을 완료하세요.`)
      console.log(`(자동으로 열리지 않으면 아래 URL을 복사하세요)`)
      console.log(`${authorizeUrl}\n`)
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`포트 ${OAUTH_PORT}이 사용 중입니다. 잠시 후 다시 시도하세요.`))
      } else {
        reject(err)
      }
    })
  })
}

export async function connectSlack(): Promise<SlackOAuthData> {
  const params = await waitForCallback('slack')
  if (!params.token) throw new Error('Slack 토큰을 받지 못했습니다.')
  return {
    token: params.token,
    userId: params.userId ?? '',
    userName: params.userName ?? '',
  }
}

export async function connectGitHub(): Promise<GitHubOAuthData> {
  const params = await waitForCallback('github')
  if (!params.token) throw new Error('GitHub 토큰을 받지 못했습니다.')
  return {
    token: params.token,
    username: params.username ?? '',
  }
}
