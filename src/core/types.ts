// ============================================================
// 업무일지 자동화 - Shared Type Definitions
// ============================================================

// --- Configuration ---

export interface AppConfig {
  remote: RemoteConfig
  slack: SlackConfig
  github: GitHubConfig
  ai: AIConfig
  general: GeneralConfig
  scheduler: SchedulerConfig
}

export interface RemoteConfig {
  email: string
  password: string
  employmentId: string
  timezone: string
}

export interface SlackConfig {
  userToken: string
  userId: string
  userName: string
}

export interface GitHubConfig {
  accessToken: string
  username: string
  repos: GitHubRepo[]
}

export interface GitHubRepo {
  owner: string
  name: string
}

export interface AIConfig {
  openRouterApiKey: string
  model: string
  language: 'ko' | 'en'
}

export interface GeneralConfig {
  headless: boolean
  slowMo: number
}

export interface SchedulerConfig {
  enabled: boolean
  time: string // HH:mm format, e.g. "18:00"
  skipWeekends: boolean
}

export type IntegrationStatus = 'disconnected' | 'connected' | 'error'

export interface IntegrationState {
  slack: { status: IntegrationStatus; userName?: string; error?: string }
  github: { status: IntegrationStatus; username?: string; repoCount: number; error?: string }
  ai: { status: IntegrationStatus; model?: string; error?: string }
}

// --- Data Collection ---

export interface GitCommit {
  hash: string
  message: string
  timestamp: Date
  repo: string
}

export interface SlackMessage {
  text: string
  channel: string
  channelName: string
  timestamp: Date
  permalink?: string
}

export interface DailyWorkData {
  date: string // YYYY-MM-DD
  dayOfWeek: string // Mon, Tue, ...
  commits: GitCommit[]
  slackMessages: SlackMessage[]
}

export interface WeeklyWorkData {
  weekStart: string // YYYY-MM-DD (Monday)
  weekEnd: string // YYYY-MM-DD (Sunday)
  days: DailyWorkData[]
}

// --- AI Summary ---

export interface DailySummary {
  date: string
  amNotes: string // Morning summary (before 12:00)
  pmNotes: string // Afternoon summary (12:00 and after)
  rawAmData: { commits: GitCommit[]; messages: SlackMessage[] }
  rawPmData: { commits: GitCommit[]; messages: SlackMessage[] }
}

export interface WeeklySummary {
  weekStart: string
  weekEnd: string
  days: DailySummary[]
}

// --- Automation ---

export interface TimesheetEntry {
  date: string
  timeRange: string // e.g., "09:00-12:00"
  type: 'regular' | 'break' | 'pto'
  period: 'am' | 'pm'
  currentNotes?: string
  newNotes?: string
}

export interface AutomationProgress {
  status: AutomationStatus
  currentDay?: string
  currentStep?: string
  totalDays: number
  completedDays: number
  logs: LogEntry[]
  error?: string
}

export type AutomationStatus =
  | 'idle'
  | 'collecting'
  | 'summarizing'
  | 'previewing'
  | 'automating'
  | 'done'
  | 'error'

export interface LogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

// --- OAuth ---

export interface OAuthResult {
  ok: boolean
  error?: string
}

export interface SlackOAuthResult extends OAuthResult {
  userName?: string
  userId?: string
}

export interface GitHubOAuthResult extends OAuthResult {
  username?: string
}

export interface GitHubRepoInfo {
  owner: string
  name: string
  fullName: string
  private: boolean
}

// --- IPC (Electron) ---

export interface IpcApi {
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: Partial<AppConfig>) => Promise<void>

  // OAuth
  oauthSlack: () => Promise<SlackOAuthResult>
  oauthGithub: () => Promise<GitHubOAuthResult>
  slackDisconnect: () => Promise<void>
  githubDisconnect: () => Promise<void>

  // GitHub repos
  githubRepos: () => Promise<{ repos: GitHubRepoInfo[]; error?: string }>
  githubSaveRepos: (repos: GitHubRepo[]) => Promise<void>

  // Integration tests
  testSlack: () => Promise<{ ok: boolean; user?: string; error?: string }>
  testGithub: () => Promise<{ ok: boolean; username?: string; error?: string }>
  testAi: () => Promise<{ ok: boolean; error?: string }>

  getIntegrationState: () => Promise<IntegrationState>

  // Automation
  runNow: () => Promise<void>
  cancelRun: () => Promise<void>

  // Scheduler
  getSchedulerStatus: () => Promise<{ enabled: boolean; nextRun?: string }>

  // Events
  onProgress: (callback: (progress: AutomationProgress) => void) => () => void
  onSchedulerTick: (callback: (status: { enabled: boolean; nextRun?: string }) => void) => () => void
}
