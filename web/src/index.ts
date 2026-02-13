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
  .token-box {
    background: #1e293b; border: 1px solid #334155; border-radius: 0.5rem;
    padding: 1rem; margin-top: 1rem; text-align: left; word-break: break-all;
  }
  .token-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem; }
  .token-value { font-size: 0.8rem; color: #e2e8f0; font-family: monospace; }
  .success { color: #4ade80; font-size: 2.5rem; margin-bottom: 0.75rem; }
  .error { color: #f87171; font-size: 2.5rem; margin-bottom: 0.75rem; }
  .copy-btn {
    background: #334155; border: 1px solid #475569; color: #94a3b8; border-radius: 0.375rem;
    padding: 0.25rem 0.75rem; font-size: 0.75rem; cursor: pointer; margin-top: 0.5rem;
    transition: background 0.15s;
  }
  .copy-btn:hover { background: #475569; color: #e2e8f0; }
  .info { font-size: 0.8rem; color: #64748b; margin-top: 1.5rem; }
`

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function landingPage(origin: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>업무일지 자동화</title><style>${PAGE_STYLE}</style></head>
<body><div class="container">
  <h1>업무일지 자동화</h1>
  <p class="sub">Remote.com Time Tracking 업무내용 자동 입력 도구</p>
  <a href="${origin}/download" class="btn" style="background:#3b82f6;">앱 다운로드</a>
  <div style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid #334155;">
    <p class="sub" style="margin-bottom:0.75rem;">이미 앱을 설치했나요? 계정을 연결하세요.</p>
    <a href="${origin}/api/slack/authorize" class="btn btn-slack">Connect Slack</a>
    <a href="${origin}/api/github/authorize" class="btn btn-github">Connect GitHub</a>
  </div>
</div></body></html>`
}

function successPage(provider: string, data: Record<string, string>): string {
  const entries = Object.entries(data)
    .map(
      ([key, value]) => `
      <div class="token-box">
        <div class="token-label">${escapeHtml(key)}</div>
        <div class="token-value" id="${escapeHtml(key)}">${escapeHtml(value)}</div>
        <button class="copy-btn" onclick="copy('${escapeHtml(key)}')">Copy</button>
      </div>`
    )
    .join('')

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(provider)} Connected</title><style>${PAGE_STYLE}</style></head>
<body><div class="container">
  <div class="success">&check;</div>
  <h1>${escapeHtml(provider)} Connected</h1>
  <p class="sub">Copy the values below into the desktop app settings.</p>
  ${entries}
  <p class="info">You can close this tab after copying.</p>
</div>
<script>
function copy(id) {
  var el = document.getElementById(id);
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(function() {
    var btn = el.parentElement.querySelector('.copy-btn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(function() { btn.textContent = 'Copy'; }, 1500); }
  });
}
</script>
</body></html>`
}

function errorPage(provider: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(provider)} Error</title><style>${PAGE_STYLE}</style></head>
<body><div class="container">
  <div class="error">&times;</div>
  <h1>Connection Failed</h1>
  <p class="sub">${escapeHtml(message)}</p>
  <p class="info">Please close this tab and try again.</p>
</div></body></html>`
}

app.get('/', (c) => {
  return c.html(landingPage(getOrigin(c.req.raw)))
})

// Download page — detects OS and links to latest GitHub Release
const GITHUB_REPO = 'LauncherCapital/auto-remote'

type ReleaseAsset = {
  name: string
  browser_download_url: string
  size: number
}

type ReleaseData = {
  tag_name: string
  published_at: string
  assets: ReleaseAsset[]
}

function detectOS(ua: string): 'mac' | 'windows' | 'unknown' {
  const lower = ua.toLowerCase()
  if (lower.includes('windows') || lower.includes('win64') || lower.includes('win32')) return 'windows'
  if (lower.includes('macintosh') || lower.includes('mac os')) return 'mac'
  return 'unknown'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function downloadPage(release: ReleaseData | null, detectedOS: string, origin: string): string {
  if (!release) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>다운로드 - 업무일지 자동화</title><style>${PAGE_STYLE}</style></head>
<body><div class="container">
  <h1>업무일지 자동화</h1>
  <p class="sub">아직 릴리즈된 버전이 없습니다.</p>
  <p class="info">관리자에게 문의하세요.</p>
</div></body></html>`
  }

  const dmg = release.assets.find(a => a.name.endsWith('.dmg'))
  const exe = release.assets.find(a => a.name.endsWith('.exe'))
  const version = release.tag_name

  const primaryAsset = detectedOS === 'windows' ? exe : dmg
  const secondaryAsset = detectedOS === 'windows' ? dmg : exe
  const primaryLabel = detectedOS === 'windows' ? 'Windows' : 'macOS'
  const secondaryLabel = detectedOS === 'windows' ? 'macOS' : 'Windows'

  let primaryBtn = ''
  if (primaryAsset) {
    const url = `${origin}/download/${encodeURIComponent(primaryAsset.name)}`
    primaryBtn = `<a href="${escapeHtml(url)}" class="btn" style="background:#3b82f6;font-size:1rem;padding:1rem 1.5rem;">
      ${primaryLabel}용 다운로드 <span style="font-size:0.8rem;opacity:0.8;">${version}</span>
      <br><span style="font-size:0.75rem;opacity:0.6;">${escapeHtml(primaryAsset.name)} · ${formatBytes(primaryAsset.size)}</span>
    </a>`
  }

  let secondaryBtn = ''
  if (secondaryAsset) {
    const url = `${origin}/download/${encodeURIComponent(secondaryAsset.name)}`
    secondaryBtn = `<a href="${escapeHtml(url)}" class="btn" style="background:#334155;font-size:0.85rem;">
      ${secondaryLabel}용 다운로드
      <span style="font-size:0.75rem;opacity:0.6;">${formatBytes(secondaryAsset.size)}</span>
    </a>`
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>다운로드 - 업무일지 자동화</title><style>${PAGE_STYLE}
  .version { font-size: 0.75rem; color: #64748b; margin-bottom: 1.5rem; }
</style></head>
<body><div class="container">
  <h1>업무일지 자동화</h1>
  <p class="sub">Remote.com Time Tracking 업무내용 자동 입력 도구</p>
  <p class="version">${escapeHtml(version)} · ${new Date(release.published_at).toLocaleDateString('ko-KR')}</p>
  ${primaryBtn}
  ${secondaryBtn}
  <p class="info">설치 후 이 사이트에서 Slack/GitHub 계정을 연결하세요.</p>
</div></body></html>`
}

function githubHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'auto-remote-web',
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

app.get('/download', async (c) => {
  const env = getEnv(c)
  const ua = c.req.header('user-agent') ?? ''
  const os = detectOS(ua)

  let release: ReleaseData | null = null
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: githubHeaders(env.GITHUB_TOKEN),
    })
    if (res.ok) {
      release = (await res.json()) as ReleaseData
    }
  } catch {
  }

  return c.html(downloadPage(release, os, getOrigin(c.req.raw)))
})

app.get('/download/:filename', async (c) => {
  const env = getEnv(c)
  const filename = c.req.param('filename')

  if (!env.GITHUB_TOKEN) {
    return c.text('Not configured', 500)
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: githubHeaders(env.GITHUB_TOKEN),
    })
    if (!res.ok) return c.text('Release not found', 404)

    const release = (await res.json()) as ReleaseData
    const asset = release.assets.find(a => a.name === filename)
    if (!asset) return c.text('Asset not found', 404)

    const assetRes = await fetch(asset.browser_download_url, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/octet-stream',
        'User-Agent': 'auto-remote-web',
      },
      redirect: 'follow',
    })

    if (!assetRes.ok || !assetRes.body) return c.text('Download failed', 502)

    return new Response(assetRes.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        ...(assetRes.headers.get('content-length')
          ? { 'Content-Length': assetRes.headers.get('content-length')! }
          : {}),
      },
    })
  } catch {
    return c.text('Download failed', 500)
  }
})

// Slack OAuth — scopes kept in sync with src/main/oauth.ts
app.get('/api/slack/authorize', (c) => {
  const env = getEnv(c)
  if (!env.SLACK_CLIENT_ID) {
    return c.html(errorPage('Slack', 'SLACK_CLIENT_ID not configured'), 500)
  }

  const state = generateState()
  const origin = getOrigin(c.req.raw)

  setCookie(c, 'slack_oauth_state', state, {
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
    return c.html(errorPage('Slack', `OAuth denied: ${oauthError}`))
  }

  if (!code || !state) {
    return c.html(errorPage('Slack', 'Missing authorization code or state'), 400)
  }

  const storedState = getCookie(c, 'slack_oauth_state')
  deleteCookie(c, 'slack_oauth_state', { path: '/' })

  if (!storedState || state !== storedState) {
    return c.html(errorPage('Slack', 'Invalid state — possible CSRF. Please try again.'), 401)
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
      return c.html(errorPage('Slack', tokenData.error ?? 'Failed to get access token'))
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
    } catch {
    }

    return c.html(
      successPage('Slack', {
        SLACK_USER_TOKEN: userToken,
        SLACK_USER_ID: userId,
        ...(userName ? { SLACK_USER_NAME: userName } : {}),
      })
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.html(errorPage('Slack', message), 500)
  }
})

// GitHub OAuth — scopes kept in sync with src/main/oauth.ts
app.get('/api/github/authorize', (c) => {
  const env = getEnv(c)
  if (!env.GITHUB_CLIENT_ID) {
    return c.html(errorPage('GitHub', 'GITHUB_CLIENT_ID not configured'), 500)
  }

  const state = generateState()
  const origin = getOrigin(c.req.raw)

  setCookie(c, 'github_oauth_state', state, {
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
    return c.html(errorPage('GitHub', `OAuth denied: ${oauthError}`))
  }

  if (!code || !state) {
    return c.html(errorPage('GitHub', 'Missing authorization code or state'), 400)
  }

  const storedState = getCookie(c, 'github_oauth_state')
  deleteCookie(c, 'github_oauth_state', { path: '/' })

  if (!storedState || state !== storedState) {
    return c.html(errorPage('GitHub', 'Invalid state — possible CSRF. Please try again.'), 401)
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
        errorPage('GitHub', tokenData.error_description ?? tokenData.error ?? 'Failed to get access token')
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
    } catch {
    }

    return c.html(
      successPage('GitHub', {
        GITHUB_ACCESS_TOKEN: accessToken,
        ...(username ? { GITHUB_USERNAME: username } : {}),
      })
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.html(errorPage('GitHub', message), 500)
  }
})

export default app
