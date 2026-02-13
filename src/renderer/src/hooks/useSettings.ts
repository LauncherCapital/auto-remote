import { useState, useEffect, useCallback } from 'react'
import type { AppConfig } from '@core/types'

const DEFAULT_CONFIG: AppConfig = {
  remote: { email: '', password: '', employmentId: '', timezone: 'Asia/Seoul' },
  slack: { userToken: '', userId: '' },
  git: { repos: [], authorEmail: '' },
  ai: { openRouterApiKey: '', model: 'openai/gpt-4o-mini', language: 'ko' },
  general: { headless: true, slowMo: 50 }
}

export function useSettings() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [testingSlack, setTestingSlack] = useState(false)
  const [testingGit, setTestingGit] = useState(false)
  const [slackTestResult, setSlackTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [gitTestResult, setGitTestResult] = useState<{ results: Array<{ repo: string; ok: boolean; error?: string }> } | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      const loadedConfig = await window.api.getConfig()
      setConfig(loadedConfig)
    } catch (error) {
      console.error('Failed to load config:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const saveConfig = useCallback(async (newConfig: Partial<AppConfig>) => {
    try {
      await window.api.saveConfig(newConfig)
      setConfig((prev) => ({ ...prev, ...newConfig }))
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }, [])

  const testSlack = useCallback(async () => {
    try {
      setTestingSlack(true)
      setSlackTestResult(null)
      const result = await window.api.testSlackConnection()
      setSlackTestResult(result)
    } catch (error) {
      setSlackTestResult({ ok: false, error: String(error) })
    } finally {
      setTestingSlack(false)
    }
  }, [])

  const testGit = useCallback(async () => {
    try {
      setTestingGit(true)
      setGitTestResult(null)
      const result = await window.api.testGitRepos()
      setGitTestResult(result)
    } catch (error) {
      setGitTestResult({ results: [] }) 
      console.error(error)
    } finally {
      setTestingGit(false)
    }
  }, [])

  return {
    config,
    loading,
    saveConfig,
    testSlack,
    testGit,
    slackTestResult,
    gitTestResult,
    testingSlack,
    testingGit
  }
}
