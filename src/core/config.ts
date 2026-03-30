import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AppConfig, GitHubRepo } from './types'

const CONFIG_DIR = join(homedir(), '.config', 'auto-remote')
const ENV_PATH = join(CONFIG_DIR, '.env')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const content = readFileSync(path, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    env[key] = value
  }
  return env
}

function loadJsonConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

export function loadConfig(): AppConfig {
  const env = parseEnvFile(ENV_PATH)
  const json = loadJsonConfig(CONFIG_PATH) as Record<string, Record<string, unknown>>

  return {
    remote: {
      email: (json.remote?.email as string) ?? env.REMOTE_EMAIL ?? '',
      password: (json.remote?.password as string) ?? env.REMOTE_PASSWORD ?? '',
      employmentId: (json.remote?.employmentId as string) ?? '',
      timezone: (json.remote?.timezone as string) ?? 'Asia/Seoul',
    },
    slack: {
      userToken: (json.slack?.userToken as string) ?? env.SLACK_USER_TOKEN ?? '',
      userId: (json.slack?.userId as string) ?? env.SLACK_USER_ID ?? '',
      userName: (json.slack?.userName as string) ?? env.SLACK_USER_NAME ?? '',
    },
    github: {
      accessToken: (json.github?.accessToken as string) ?? env.GITHUB_ACCESS_TOKEN ?? '',
      username: (json.github?.username as string) ?? env.GITHUB_USERNAME ?? '',
      authorEmail: (json.github?.authorEmail as string) ?? env.GITHUB_AUTHOR_EMAIL ?? undefined,
      repos: (json.github?.repos as GitHubRepo[]) ?? (json.git?.repos as GitHubRepo[]) ?? [],
    },
    ai: {
      openRouterApiKey: env.OPENROUTER_API_KEY ?? '',
      model: (json.ai?.model as string) ?? 'openai/gpt-4o-mini',
      language: (json.ai?.language as 'ko' | 'en') ?? 'ko',
    },
    general: {
      headless: (json.general?.headless as boolean) ?? true,
      slowMo: (json.general?.slowMo as number) ?? 0,
    },
  }
}

export function saveJsonConfig(config: Record<string, unknown>): void {
  ensureConfigDir()
  const existing = loadJsonConfig(CONFIG_PATH)
  const merged = deepMerge(existing, config)
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')
}

export function saveEnvValue(key: string, value: string): void {
  ensureConfigDir()
  const env = parseEnvFile(ENV_PATH)
  env[key] = value
  const content = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  writeFileSync(ENV_PATH, content + '\n', 'utf-8')
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      )
    } else {
      result[key] = source[key]
    }
  }
  return result
}

export function getAuthStatePath(): string {
  return join(CONFIG_DIR, 'auth.json')
}

export function getOAuthCredentials(provider: 'slack' | 'github'): { clientId: string; clientSecret: string } {
  const env = parseEnvFile(ENV_PATH)
  if (provider === 'slack') {
    return { clientId: env.SLACK_CLIENT_ID ?? '', clientSecret: env.SLACK_CLIENT_SECRET ?? '' }
  }
  return { clientId: env.GITHUB_CLIENT_ID ?? '', clientSecret: env.GITHUB_CLIENT_SECRET ?? '' }
}

export function removeEnvValues(keys: string[]): void {
  const env = parseEnvFile(ENV_PATH)
  for (const key of keys) {
    delete env[key]
  }
  const content = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  writeFileSync(ENV_PATH, content + '\n', 'utf-8')
}
