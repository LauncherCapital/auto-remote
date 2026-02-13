import { useState, useEffect } from 'react'
import { useSettings } from '../hooks/useSettings'
import type { AppConfig } from '@core/types'

const inputClass =
  'w-full bg-slate-700 border border-slate-600 text-slate-200 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const labelClass = 'block text-sm font-medium text-slate-300 mb-1'
const sectionClass = 'bg-slate-800 rounded-lg p-5 space-y-4'
const btnPrimary =
  'bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnSecondary =
  'bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50'

export function Settings() {
  const {
    config,
    loading,
    saveConfig,
    testSlack,
    testGit,
    slackTestResult,
    gitTestResult,
    testingSlack,
    testingGit,
  } = useSettings()

  const [form, setForm] = useState<AppConfig | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config && !form) {
      setForm(config)
    }
  }, [config, form])

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading settings...</div>
      </div>
    )
  }

  const update = <K extends keyof AppConfig>(section: K, field: string, value: string | boolean | number) => {
    setForm((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [section]: { ...prev[section], [field]: value },
      }
    })
    setSaved(false)
  }

  const updateRepos = (repos: string[]) => {
    setForm((prev) => {
      if (!prev) return prev
      return { ...prev, git: { ...prev.git, repos } }
    })
    setSaved(false)
  }

  const handleSave = async () => {
    if (!form) return
    await saveConfig(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Settings</h2>
        <div className="flex items-center gap-3">
          {saved && <span className="text-green-400 text-sm">Saved!</span>}
          <button onClick={handleSave} className={btnPrimary}>
            Save All Settings
          </button>
        </div>
      </div>

      {/* Remote.com */}
      <section className={sectionClass}>
        <h3 className="text-base font-semibold text-slate-200 border-b border-slate-700 pb-2">
          Remote.com
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              className={inputClass}
              value={form.remote.email}
              onChange={(e) => update('remote', 'email', e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              className={inputClass}
              value={form.remote.password}
              onChange={(e) => update('remote', 'password', e.target.value)}
              placeholder="Password"
            />
          </div>
          <div>
            <label className={labelClass}>Employment ID</label>
            <input
              type="text"
              className={inputClass}
              value={form.remote.employmentId}
              onChange={(e) => update('remote', 'employmentId', e.target.value)}
              placeholder="UUID"
            />
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <input
              type="text"
              className={inputClass}
              value={form.remote.timezone}
              onChange={(e) => update('remote', 'timezone', e.target.value)}
              placeholder="Asia/Seoul"
            />
          </div>
        </div>
      </section>

      {/* Slack */}
      <section className={sectionClass}>
        <h3 className="text-base font-semibold text-slate-200 border-b border-slate-700 pb-2">
          Slack
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>User Token (xoxp-...)</label>
            <input
              type="password"
              className={inputClass}
              value={form.slack.userToken}
              onChange={(e) => update('slack', 'userToken', e.target.value)}
              placeholder="xoxp-..."
            />
          </div>
          <div>
            <label className={labelClass}>User ID</label>
            <input
              type="text"
              className={inputClass}
              value={form.slack.userId}
              onChange={(e) => update('slack', 'userId', e.target.value)}
              placeholder="U0XXXXXXXX"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={testSlack} disabled={testingSlack} className={btnSecondary}>
            {testingSlack ? 'Testing...' : 'Test Connection'}
          </button>
          {slackTestResult && (
            <span className={`text-sm ${slackTestResult.ok ? 'text-green-400' : 'text-red-400'}`}>
              {slackTestResult.ok ? 'Connected!' : slackTestResult.error || 'Failed'}
            </span>
          )}
        </div>
      </section>

      {/* Git Repos */}
      <section className={sectionClass}>
        <h3 className="text-base font-semibold text-slate-200 border-b border-slate-700 pb-2">
          Git Repositories
        </h3>
        <div>
          <label className={labelClass}>Author Email</label>
          <input
            type="email"
            className={inputClass}
            value={form.git.authorEmail}
            onChange={(e) => update('git', 'authorEmail', e.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div className="space-y-2">
          <label className={labelClass}>Repository Paths</label>
          {form.git.repos.map((repo, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                className={inputClass}
                value={repo}
                onChange={(e) => {
                  const repos = [...form.git.repos]
                  repos[i] = e.target.value
                  updateRepos(repos)
                }}
                placeholder="/path/to/repo"
              />
              <button
                onClick={() => {
                  updateRepos(form.git.repos.filter((_, j) => j !== i))
                }}
                className="text-red-400 hover:text-red-300 px-2 text-lg flex-shrink-0"
                title="Remove"
              >
                x
              </button>
            </div>
          ))}
          <button
            onClick={() => updateRepos([...form.git.repos, ''])}
            className={btnSecondary}
          >
            + Add Repository
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={testGit} disabled={testingGit} className={btnSecondary}>
            {testingGit ? 'Testing...' : 'Test Repos'}
          </button>
          {gitTestResult && (
            <div className="flex flex-wrap gap-2">
              {gitTestResult.results.map((r, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-1 rounded ${
                    r.ok ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                  }`}
                >
                  {r.repo.split('/').pop()}: {r.ok ? 'OK' : r.error || 'Failed'}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* AI */}
      <section className={sectionClass}>
        <h3 className="text-base font-semibold text-slate-200 border-b border-slate-700 pb-2">
          AI (OpenRouter)
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>API Key</label>
            <input
              type="password"
              className={inputClass}
              value={form.ai.openRouterApiKey}
              onChange={(e) => update('ai', 'openRouterApiKey', e.target.value)}
              placeholder="sk-or-..."
            />
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input
              type="text"
              className={inputClass}
              value={form.ai.model}
              onChange={(e) => update('ai', 'model', e.target.value)}
              placeholder="openai/gpt-4o-mini"
            />
          </div>
          <div>
            <label className={labelClass}>Summary Language</label>
            <select
              className={inputClass}
              value={form.ai.language}
              onChange={(e) => update('ai', 'language', e.target.value)}
            >
              <option value="ko">Korean</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </section>

      {/* General */}
      <section className={sectionClass}>
        <h3 className="text-base font-semibold text-slate-200 border-b border-slate-700 pb-2">
          General
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="headless"
              checked={form.general.headless}
              onChange={(e) => update('general', 'headless', e.target.checked)}
              className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
            />
            <label htmlFor="headless" className="text-sm text-slate-300">
              Headless Mode (hide browser)
            </label>
          </div>
          <div>
            <label className={labelClass}>Slow Motion (ms)</label>
            <input
              type="number"
              className={inputClass}
              value={form.general.slowMo}
              onChange={(e) => update('general', 'slowMo', Number(e.target.value))}
              min={0}
              step={50}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
