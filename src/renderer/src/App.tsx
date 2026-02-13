import { useState, useEffect, useCallback, useRef } from 'react'
import type { AppConfig, AutomationProgress, GitHubRepo, GitHubRepoInfo, LogEntry } from '@core/types'

type Step = 'remote' | 'integrations' | 'dashboard'

const inputClass =
  'w-full bg-slate-700 border border-slate-600 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelClass = 'block text-sm font-medium text-slate-300 mb-1.5'
const btnPrimary =
  'w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50'

const initialProgress: AutomationProgress = {
  status: 'idle',
  totalDays: 0,
  completedDays: 0,
  logs: [],
}

function getInitialStep(config: AppConfig | null): Step {
  if (!config) return 'remote'
  if (!config.remote.email || !config.remote.password) return 'remote'
  return 'dashboard'
}

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [step, setStep] = useState<Step>('remote')
  const [progress, setProgress] = useState<AutomationProgress>(initialProgress)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.api) {
      setError('window.api is not available. Preload script may have failed.')
      setLoading(false)
      return
    }

    try {
      window.api
        .getConfig()
        .then((cfg) => {
          setConfig(cfg)
          setStep(getInitialStep(cfg))
        })
        .catch((err) => {
          setError(String(err))
        })
        .finally(() => setLoading(false))
    } catch (err) {
      setError(String(err))
      setLoading(false)
      return
    }

    const unsub = window.api.onProgress((p) => setProgress(p as AutomationProgress))
    return unsub
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [progress.logs.length])

  const saveConfig = useCallback(async (partial: Partial<AppConfig>) => {
    await window.api.saveConfig(partial)
    const cfg = await window.api.getConfig()
    setConfig(cfg)
    return cfg
  }, [])

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 text-red-400 p-8 text-center text-sm">
        {error}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 text-slate-500 text-sm">
        Loading...
      </div>
    )
  }

  return (
    <div className="h-screen bg-slate-900 text-slate-200 flex flex-col overflow-hidden">
      <div className="h-8 app-region-drag flex-shrink-0" />
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {step === 'remote' && (
          <RemoteStep
            config={config}
            onSave={async (remote) => {
              const cfg = await saveConfig({ remote })
              if (cfg.remote.email && cfg.remote.password) setStep('integrations')
            }}
          />
        )}
        {step === 'integrations' && (
          <IntegrationsStep
            config={config!}
            onSave={saveConfig}
            onDone={() => setStep('dashboard')}
          />
        )}
        {step === 'dashboard' && (
          <DashboardStep
            config={config!}
            progress={progress}
            logEndRef={logEndRef}
            onSave={saveConfig}
            onEditAccounts={() => setStep('integrations')}
          />
        )}
      </div>
    </div>
  )
}

function RemoteStep({
  config,
  onSave,
}: {
  config: AppConfig | null
  onSave: (remote: AppConfig['remote']) => Promise<void>
}) {
  const [email, setEmail] = useState(config?.remote.email ?? '')
  const [password, setPassword] = useState(config?.remote.password ?? '')
  const [employmentId, setEmploymentId] = useState(config?.remote.employmentId ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await onSave({ email, password, employmentId, timezone: 'Asia/Seoul' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto pt-16 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold text-slate-100">업무일지 자동화</h1>
        <p className="text-sm text-slate-500">Remote.com 계정으로 시작하세요</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </div>
        <div>
          <label className={labelClass}>Password</label>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
        </div>
        <div>
          <label className={labelClass}>Employment ID</label>
          <input
            type="text"
            className={inputClass}
            value={employmentId}
            onChange={(e) => setEmploymentId(e.target.value)}
            placeholder="UUID (optional)"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving || !email || !password}
          className={btnPrimary}
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function IntegrationsStep({
  config,
  onSave,
  onDone,
}: {
  config: AppConfig
  onSave: (partial: Partial<AppConfig>) => Promise<AppConfig>
  onDone: () => void
}) {
  const [slackConnecting, setSlackConnecting] = useState(false)
  const [slackError, setSlackError] = useState<string | null>(null)
  const [slackManual, setSlackManual] = useState(false)
  const [slackToken, setSlackToken] = useState('')
  const [slackUserId, setSlackUserId] = useState('')

  const [githubConnecting, setGithubConnecting] = useState(false)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [availableRepos, setAvailableRepos] = useState<GitHubRepoInfo[]>([])
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(
    new Set(config.github.repos.map((r) => `${r.owner}/${r.name}`))
  )
  const [loadingRepos, setLoadingRepos] = useState(false)

  const [aiKey, setAiKey] = useState(config.ai.openRouterApiKey)
  const [aiModel, setAiModel] = useState(config.ai.model || 'openai/gpt-4o-mini')
  const [saving, setSaving] = useState(false)

  const slackConnected = !!config.slack.userToken
  const githubConnected = !!config.github.accessToken

  const handleSlackConnect = async () => {
    setSlackConnecting(true)
    setSlackError(null)
    try {
      const result = await window.api.oauthSlack()
      if (result.ok) {
        await onSave({})
      } else {
        setSlackError(result.error ?? 'Connection failed')
      }
    } catch (err) {
      setSlackError(err instanceof Error ? err.message : String(err))
    } finally {
      setSlackConnecting(false)
    }
  }

  const handleSlackDisconnect = async () => {
    await window.api.slackDisconnect()
    await onSave({})
  }

  const handleSlackManualSave = async () => {
    if (!slackToken) return
    await onSave({
      slack: { userToken: slackToken, userId: slackUserId, userName: '' },
    })
    setSlackManual(false)
    setSlackToken('')
    setSlackUserId('')
  }

  const handleGithubConnect = async () => {
    setGithubConnecting(true)
    setGithubError(null)
    try {
      const result = await window.api.oauthGithub()
      if (result.ok) {
        await onSave({})
        fetchRepos()
      } else {
        setGithubError(result.error ?? 'Connection failed')
      }
    } catch (err) {
      setGithubError(err instanceof Error ? err.message : String(err))
    } finally {
      setGithubConnecting(false)
    }
  }

  const handleGithubDisconnect = async () => {
    await window.api.githubDisconnect()
    setAvailableRepos([])
    setSelectedRepos(new Set())
    await onSave({})
  }

  const fetchRepos = useCallback(async () => {
    setLoadingRepos(true)
    try {
      const { repos } = await window.api.githubRepos()
      setAvailableRepos(repos)
    } catch {
    } finally {
      setLoadingRepos(false)
    }
  }, [])

  useEffect(() => {
    if (githubConnected && availableRepos.length === 0) {
      fetchRepos()
    }
  }, [githubConnected, fetchRepos, availableRepos.length])

  const toggleRepo = (fullName: string) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev)
      if (next.has(fullName)) next.delete(fullName)
      else next.add(fullName)
      return next
    })
  }

  const handleSaveRepos = async () => {
    const repos: GitHubRepo[] = Array.from(selectedRepos).map((fn) => {
      const [owner, name] = fn.split('/')
      return { owner, name }
    })
    await window.api.githubSaveRepos(repos)
    await onSave({})
  }

  const handleSaveAi = async () => {
    setSaving(true)
    try {
      await onSave({
        ai: { openRouterApiKey: aiKey, model: aiModel, language: config.ai.language },
      })
    } finally {
      setSaving(false)
    }
  }

  const btnConnect =
    'w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50'
  const btnDisconnect =
    'text-xs text-red-400 hover:text-red-300 transition-colors'
  const spinner = (
    <svg className="animate-spin h-4 w-4 inline-block mr-1.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )

  return (
    <div className="max-w-sm mx-auto pt-8 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-lg font-bold text-slate-100">연동 설정</h1>
        <p className="text-sm text-slate-500">데이터 수집에 필요한 서비스를 연결하세요</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Slack</h3>
        <div className="bg-slate-800 rounded-lg p-4 space-y-3">
          {slackConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-sm text-slate-200">{config.slack.userName || 'Connected'}</span>
              </div>
              <button onClick={handleSlackDisconnect} className={btnDisconnect}>Disconnect</button>
            </div>
          ) : (
            <>
              <button onClick={handleSlackConnect} disabled={slackConnecting} className={btnConnect}>
                {slackConnecting ? <>{spinner}Connecting...</> : 'Connect Slack'}
              </button>
              {slackError && <div className="text-xs text-red-400">{slackError}</div>}
              {!slackManual ? (
                <button onClick={() => setSlackManual(true)} className="text-xs text-slate-500 hover:text-slate-400">
                  Enter token manually
                </button>
              ) : (
                <div className="space-y-2 pt-1">
                  <input type="password" className={inputClass} value={slackToken} onChange={(e) => setSlackToken(e.target.value)} placeholder="xoxp-..." />
                  <input type="text" className={inputClass} value={slackUserId} onChange={(e) => setSlackUserId(e.target.value)} placeholder="User ID (U0XXXXXXXX)" />
                  <div className="flex gap-2">
                    <button onClick={handleSlackManualSave} disabled={!slackToken} className="flex-1 bg-slate-600 hover:bg-slate-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50">
                      Save
                    </button>
                    <button onClick={() => setSlackManual(false)} className="text-xs text-slate-500 hover:text-slate-400 px-2">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">GitHub</h3>
        <div className="bg-slate-800 rounded-lg p-4 space-y-3">
          {githubConnected ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-sm text-slate-200">{config.github.username || 'Connected'}</span>
                </div>
                <button onClick={handleGithubDisconnect} className={btnDisconnect}>Disconnect</button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-400">Repositories</label>
                  {loadingRepos && <span className="text-xs text-slate-500">{spinner}</span>}
                </div>
                {availableRepos.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {availableRepos.map((repo) => (
                      <label key={repo.fullName} className="flex items-center gap-2 text-sm text-slate-300 hover:text-slate-200 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={selectedRepos.has(repo.fullName)}
                          onChange={() => toggleRepo(repo.fullName)}
                          className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <span className="truncate">{repo.fullName}</span>
                        {repo.private && <span className="text-[10px] text-slate-500 bg-slate-700 px-1 rounded">private</span>}
                      </label>
                    ))}
                  </div>
                )}
                {availableRepos.length > 0 && (
                  <button onClick={handleSaveRepos} className="w-full bg-slate-600 hover:bg-slate-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors">
                    Save selection ({selectedRepos.size})
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <button onClick={handleGithubConnect} disabled={githubConnecting} className={btnConnect}>
                {githubConnecting ? <>{spinner}Connecting...</> : 'Connect GitHub'}
              </button>
              {githubError && <div className="text-xs text-red-400">{githubError}</div>}
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI (OpenRouter)</h3>
        <div className="bg-slate-800 rounded-lg p-4 space-y-3">
          <div>
            <label className={labelClass}>API Key</label>
            <input type="password" className={inputClass} value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder="sk-or-..." />
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input type="text" className={inputClass} value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="openai/gpt-4o-mini" />
          </div>
          <button onClick={handleSaveAi} disabled={saving} className="w-full bg-slate-600 hover:bg-slate-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <button onClick={onDone} className={btnPrimary}>
        Continue
      </button>
    </div>
  )
}

function DashboardStep({
  config,
  progress,
  logEndRef,
  onSave,
  onEditAccounts,
}: {
  config: AppConfig
  progress: AutomationProgress
  logEndRef: React.RefObject<HTMLDivElement | null>
  onSave: (partial: Partial<AppConfig>) => Promise<AppConfig>
  onEditAccounts: () => void
}) {
  const [runningNow, setRunningNow] = useState(false)
  const [schedulerStatus, setSchedulerStatus] = useState<{ enabled: boolean; nextRun?: string }>({ enabled: false })

  useEffect(() => {
    window.api.getSchedulerStatus().then(setSchedulerStatus).catch(() => {})
    const unsub = window.api.onSchedulerTick((s) => setSchedulerStatus(s as { enabled: boolean; nextRun?: string }))
    return unsub
  }, [])

  const scheduler = config.scheduler ?? { enabled: false, time: '18:00', skipWeekends: true }

  const handleRunNow = async () => {
    setRunningNow(true)
    try {
      await window.api.runNow()
    } catch {
    } finally {
      setRunningNow(false)
    }
  }

  const isRunning = runningNow || progress.status === 'automating' || progress.status === 'collecting' || progress.status === 'summarizing'

  const logColors: Record<LogEntry['level'], string> = {
    info: 'text-slate-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    success: 'text-green-400',
  }

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-100">업무일지 자동화</h1>
        <button onClick={onEditAccounts} className="text-xs text-slate-500 hover:text-slate-300">
          Settings
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scheduler</div>
        <div className="bg-slate-800 rounded-lg px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-200">Auto-run daily</span>
            <button
              onClick={() => onSave({ scheduler: { ...scheduler, enabled: !scheduler.enabled } })}
              className={`relative w-11 h-6 rounded-full transition-colors ${scheduler.enabled ? 'bg-blue-500' : 'bg-slate-600'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${scheduler.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Time</span>
            <input
              type="time"
              value={scheduler.time}
              onChange={(e) => onSave({ scheduler: { ...scheduler, time: e.target.value } })}
              className="bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Skip weekends</span>
            <button
              onClick={() => onSave({ scheduler: { ...scheduler, skipWeekends: !scheduler.skipWeekends } })}
              className={`relative w-11 h-6 rounded-full transition-colors ${scheduler.skipWeekends ? 'bg-blue-500' : 'bg-slate-600'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${scheduler.skipWeekends ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {schedulerStatus.enabled && schedulerStatus.nextRun && (
            <div className="text-xs text-slate-500">Next: {schedulerStatus.nextRun}</div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Manual</div>
        {isRunning ? (
          <button onClick={() => window.api.cancelRun()} className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
            Cancel
          </button>
        ) : (
          <button onClick={handleRunNow} className={btnPrimary}>
            Run Now
          </button>
        )}

        {progress.totalDays > 0 && (
          <div className="w-full bg-slate-700 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${(progress.completedDays / progress.totalDays) * 100}%` }} />
          </div>
        )}

        {progress.logs.length > 0 && (
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <div className="h-48 overflow-y-auto px-3 py-2 font-mono text-[11px] space-y-0.5">
              {progress.logs.map((log, i) => {
                const ts = log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp as unknown as string)
                return (
                  <div key={i} className="flex gap-2">
                    <span className="text-slate-600 flex-shrink-0">{ts.toLocaleTimeString('en-US', { hour12: false })}</span>
                    <span className={logColors[log.level]}>{log.message}</span>
                  </div>
                )
              })}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {progress.error && (
          <div className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">{progress.error}</div>
        )}
        {progress.status === 'done' && (
          <div className="text-xs text-green-400 bg-green-900/20 rounded-lg px-3 py-2">Complete!</div>
        )}
      </div>

      <div className="text-xs text-slate-600 text-center pt-4">
        {config.remote.email}
      </div>
    </div>
  )
}
