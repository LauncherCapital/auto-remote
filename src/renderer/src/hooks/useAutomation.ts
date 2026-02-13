import { useState, useEffect, useCallback } from 'react'
import type { WeeklyWorkData, WeeklySummary, AutomationProgress } from '@core/types'

export function useAutomation() {
  const [weekData, setWeekData] = useState<WeeklyWorkData | null>(null)
  const [summary, setSummary] = useState<WeeklySummary | null>(null)
  const [progress, setProgress] = useState<AutomationProgress>({
    status: 'idle',
    totalDays: 0,
    completedDays: 0,
    logs: []
  })

  useEffect(() => {
    const cleanup = window.api.onProgress((newProgress) => {
      setProgress(newProgress)
    })
    return cleanup
  }, [])

  const collectData = useCallback(async (weekStart: string) => {
    try {
      setProgress((prev) => ({ ...prev, status: 'collecting', error: undefined }))
      const data = await window.api.collectWeekData(weekStart)
      setWeekData(data)
      setProgress((prev) => ({ ...prev, status: 'idle' }))
    } catch (error) {
      setProgress((prev) => ({ ...prev, status: 'error', error: String(error) }))
    }
  }, [])

  const generateSummary = useCallback(async (data: WeeklyWorkData) => {
    try {
      setProgress((prev) => ({ ...prev, status: 'summarizing', error: undefined }))
      const result = await window.api.generateSummary(data)
      setSummary(result)
      setProgress((prev) => ({ ...prev, status: 'idle' }))
    } catch (error) {
      setProgress((prev) => ({ ...prev, status: 'error', error: String(error) }))
    }
  }, [])

  const executeAutomation = useCallback(async (summaryToExecute: WeeklySummary) => {
    try {
      // Status update happens via onProgress from main process
      await window.api.executeAutomation(summaryToExecute)
    } catch (error) {
      setProgress((prev) => ({ ...prev, status: 'error', error: String(error) }))
    }
  }, [])

  const cancelAutomation = useCallback(async () => {
    try {
      await window.api.cancelAutomation()
    } catch (error) {
      console.error('Failed to cancel automation:', error)
    }
  }, [])

  return {
    weekData,
    summary,
    setSummary, // Allow manual edits
    progress,
    collectData,
    generateSummary,
    executeAutomation,
    cancelAutomation
  }
}
