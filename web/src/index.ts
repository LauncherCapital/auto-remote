import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Env = {
  SLACK_CLIENT_ID: string
  SLACK_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  GITHUB_TOKEN: string
}

const app = new Hono<{ Bindings: Env }>()

function getEnv(c: { env: Env; req: { raw: Request } }): Env {
  return {
    SLACK_CLIENT_ID: c.env?.SLACK_CLIENT_ID ?? process.env.SLACK_CLIENT_ID ?? '',
    SLACK_CLIENT_SECRET: c.env?.SLACK_CLIENT_SECRET ?? process.env.SLACK_CLIENT_SECRET ?? '',
    GITHUB_CLIENT_ID: c.env?.GITHUB_CLIENT_ID ?? process.env.GITHUB_CLIENT_ID ?? '',
    GITHUB_CLIENT_SECRET: c.env?.GITHUB_CLIENT_SECRET ?? process.env.GITHUB_CLIENT_SECRET ?? '',
    GITHUB_TOKEN: c.env?.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '',
  }
}

function getOrigin(req: Request): string {
  return new URL(req.url).origin
}

function generateState(): string {
  return crypto.randomUUID()
}

/** CLI에서 전달한 callback URL인지 검증 (localhost만 허용) */
function isValidCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

const PAGE_STYLE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a; color: #e2e8f0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
  }
  .container { text-align: center; max-width: 400px; padding: 2rem; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #f1f5f9; }
  .sub { font-size: 0.875rem; color: #94a3b8; margin-bottom: 2rem; }
  .btn {
    display: block; width: 100%; padding: 0.75rem 1.5rem; margin-bottom: 0.75rem;
    border: none; border-radius: 0.5rem; font-size: 0.9rem; font-weight: 500;
    cursor: pointer; text-decoration: none; color: #fff; transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.9; }
  .btn-slack { background: #4A154B; }
  .btn-github { background: #24292f; }
  .success { color: #4ade80; font-size: 2.5rem; margin-bottom: 0.75rem; }
  .error { color: #f87171; font-size: 2.5rem; margin-bottom: 0.75rem; }
  .info { font-size: 0.8rem; color: #64748b; margin-top: 1.5rem; }
`

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function successPage(provider: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(provider)} 연결 완료</title><style>${PAGE_STYLE}</style></head>
<body><div class="container">
  <div class="success">✓</div>
  <h1>${escapeHtml(provider)} 연결 완료</h1>
  <p class="sub">터미널로 돌아가세요.</p>
  <p class="info">이 탭은 닫아도 됩니다.</p>
</div></body></html>`
}

function errorPage(provider: string, message: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(provider)} 오류</title><style>${PAGE_STYLE}</style></head>
<body><div class="container">
  <div class="error">✗</div>
  <h1>연결 실패</h1>
  <p class="sub">${escapeHtml(message)}</p>
  <p class="info">터미널에서 다시 시도하세요.</p>
</div></body></html>`
}

function landingPage(): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>업무일지 자동화</title><style>${PAGE_STYLE}</style></head>
<body><div class="container">
  <h1>업무일지 자동화</h1>
  <p class="sub">Remote.com Time Tracking 업무내용 자동 입력 도구</p>
  <p class="info" style="margin-top:0;margin-bottom:1.5rem;">CLI 도구입니다. 터미널에서 <code style="background:#1e293b;padding:0.1rem 0.4rem;border-radius:0.25rem;">auto-remote setup</code> 을 실행하세요.</p>
</div></body></html>`
}

app.get('/', (c) => {
  return c.html(landingPage())
})

// Slack OAuth
app.get('/api/slack/authorize', (c) => {
  const env = getEnv(c)
  if (!env.SLACK_CLIENT_ID) {
    return c.html(errorPage('Slack', 'SLACK_CLIENT_ID not configured'), 500)
  }

  const callbackUrl = c.req.query('callback') ?? ''
  if (callbackUrl && !isValidCallbackUrl(callbackUrl)) {
    return c.html(errorPage('Slack', '잘못된 callback URL'), 400)
  }

  const state = generateState()
  const origin = getOrigin(c.req.raw)

  // state 쿠키에 callback URL을 함께 저장 (JSON)
  const statePayload = JSON.stringify({ state, callbackUrl })
  setCookie(c, 'slack_oauth_state', statePayload, {
    maxAge: 600,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
  })

  const scopes = 'search:read,channels:history,channels:read,groups:history,groups:read,im:history,mpim:history,users:read'
  const redirectUri = `${origin}/api/slack/callback`

  const params = new URLSearchParams({
    user_scope: scopes,
    client_id: env.SLACK_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
  })

  return c.redirect(`https://slack.com/oauth/v2/authorize?${params}`)
})

app.get('/api/slack/callback', async (c) => {
  const env = getEnv(c)
  const code = c.req.query('code')
  const state = c.req.query('state')
  const oauthError = c.req.query('error')

  if (oauthError) {
    return c.html(errorPage('Slack', `OAuth 거부됨: ${oauthError}`))
  }

  if (!code || !state) {
    return c.html(errorPage('Slack', '인증 코드 또는 state가 없습니다'), 400)
  }

  const rawCookie = getCookie(c, 'slack_oauth_state')
  deleteCookie(c, 'slack_oauth_state', { path: '/' })

  let storedState = ''
  let callbackUrl = ''
  try {
    const parsed = JSON.parse(rawCookie ?? '{}')
    storedState = parsed.state ?? ''
    callbackUrl = parsed.callbackUrl ?? ''
  } catch {
    return c.html(errorPage('Slack', '잘못된 state 쿠키'), 400)
  }

  if (!storedState || state !== storedState) {
    return c.html(errorPage('Slack', '유효하지 않은 state — CSRF 가능성. 다시 시도하세요.'), 401)
  }

  try {
    const origin = getOrigin(c.req.raw)
    const redirectUri = `${origin}/api/slack/callback`

    const params = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    })

    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    const tokenData = (await tokenRes.json()) as {
      ok: boolean
      error?: string
      authed_user?: { id: string; access_token: string }
    }

    if (!tokenData.ok || !tokenData.authed_user?.access_token) {
      return c.html(errorPage('Slack', tokenData.error ?? '토큰 발급 실패'))
    }

    const userToken = tokenData.authed_user.access_token
    const userId = tokenData.authed_user.id

    let userName = ''
    try {
      const authRes = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${userToken}` },
      })
      const authData = (await authRes.json()) as { ok: boolean; user?: string }
      userName = authData.user ?? ''
    } catch {}

    // CLI callback URL이 있으면 localhost로 리다이렉트
    if (callbackUrl && isValidCallbackUrl(callbackUrl)) {
      const dest = new URL(callbackUrl)
      dest.searchParams.set('token', userToken)
      dest.searchParams.set('userId', userId)
      if (userName) dest.searchParams.set('userName', userName)
      return c.redirect(dest.toString())
    }

    return c.html(successPage('Slack'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.html(errorPage('Slack', message), 500)
  }
})

// GitHub OAuth
app.get('/api/github/authorize', (c) => {
  const env = getEnv(c)
  if (!env.GITHUB_CLIENT_ID) {
    return c.html(errorPage('GitHub', 'GITHUB_CLIENT_ID not configured'), 500)
  }

  const callbackUrl = c.req.query('callback') ?? ''
  if (callbackUrl && !isValidCallbackUrl(callbackUrl)) {
    return c.html(errorPage('GitHub', '잘못된 callback URL'), 400)
  }

  const state = generateState()
  const origin = getOrigin(c.req.raw)

  const statePayload = JSON.stringify({ state, callbackUrl })
  setCookie(c, 'github_oauth_state', statePayload, {
    maxAge: 600,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
  })

  const scopes = 'repo,read:user'
  const redirectUri = `${origin}/api/github/callback`

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  })

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
})

app.get('/api/github/callback', async (c) => {
  const env = getEnv(c)
  const code = c.req.query('code')
  const state = c.req.query('state')
  const oauthError = c.req.query('error')

  if (oauthError) {
    return c.html(errorPage('GitHub', `OAuth 거부됨: ${oauthError}`))
  }

  if (!code || !state) {
    return c.html(errorPage('GitHub', '인증 코드 또는 state가 없습니다'), 400)
  }

  const rawCookie = getCookie(c, 'github_oauth_state')
  deleteCookie(c, 'github_oauth_state', { path: '/' })

  let storedState = ''
  let callbackUrl = ''
  try {
    const parsed = JSON.parse(rawCookie ?? '{}')
    storedState = parsed.state ?? ''
    callbackUrl = parsed.callbackUrl ?? ''
  } catch {
    return c.html(errorPage('GitHub', '잘못된 state 쿠키'), 400)
  }

  if (!storedState || state !== storedState) {
    return c.html(errorPage('GitHub', '유효하지 않은 state — CSRF 가능성. 다시 시도하세요.'), 401)
  }

  try {
    const origin = getOrigin(c.req.raw)
    const redirectUri = `${origin}/api/github/callback`

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = (await tokenRes.json()) as {
      access_token?: string
      error?: string
      error_description?: string
    }

    if (!tokenData.access_token) {
      return c.html(
        errorPage('GitHub', tokenData.error_description ?? tokenData.error ?? '토큰 발급 실패')
      )
    }

    const accessToken = tokenData.access_token

    let username = ''
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'auto-remote-oauth',
        },
      })
      const userData = (await userRes.json()) as { login?: string }
      username = userData.login ?? ''
    } catch {}

    // CLI callback URL이 있으면 localhost로 리다이렉트
    if (callbackUrl && isValidCallbackUrl(callbackUrl)) {
      const dest = new URL(callbackUrl)
      dest.searchParams.set('token', accessToken)
      if (username) dest.searchParams.set('username', username)
      return c.redirect(dest.toString())
    }

    return c.html(successPage('GitHub'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.html(errorPage('GitHub', message), 500)
  }
})

export default app
