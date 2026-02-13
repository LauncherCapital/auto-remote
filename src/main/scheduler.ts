import { loadConfig } from '../core/config'
import { executeFullPipeline } from '../core/orchestrator'
import type { AutomationProgress } from '../core/types'

type StatusListener = (status: { enabled: boolean; nextRun?: string }) => void
type ProgressListener = (progress: AutomationProgress) => void

let checkInterval: ReturnType<typeof setInterval> | null = null
let running = false
let lastRunDate: string | null = null
let statusListeners: StatusListener[] = []
let progressListeners: ProgressListener[] = []

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday.toISOString().slice(0, 10)
}

function isWeekend(): boolean {
  const day = new Date().getDay()
  return day === 0 || day === 6
}

function currentTimeHHMM(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function getNextRunTime(scheduledTime: string, skipWeekends: boolean): string | undefined {
  const now = new Date()
  const [hours, minutes] = scheduledTime.split(':').map(Number)

  const candidate = new Date(now)
  candidate.setHours(hours, minutes, 0, 0)

  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 1)
  }

  if (skipWeekends) {
    while (candidate.getDay() === 0 || candidate.getDay() === 6) {
      candidate.setDate(candidate.getDate() + 1)
    }
  }

  return candidate.toLocaleString()
}

function notifyStatus(): void {
  const config = loadConfig()
  const status = {
    enabled: config.scheduler.enabled,
    nextRun: config.scheduler.enabled
      ? getNextRunTime(config.scheduler.time, config.scheduler.skipWeekends)
      : undefined,
  }
  for (const listener of statusListeners) {
    listener(status)
  }
}

async function tick(): Promise<void> {
  if (running) return

  const config = loadConfig()
  if (!config.scheduler.enabled) return
  if (config.scheduler.skipWeekends && isWeekend()) return

  const now = currentTimeHHMM()
  const today = todayStr()

  if (now !== config.scheduler.time) return
  if (lastRunDate === today) return

  lastRunDate = today
  running = true

  const onProgress: ProgressListener = (progress) => {
    for (const listener of progressListeners) {
      listener(progress)
    }
  }

  try {
    const weekStart = getMondayOfWeek(today)
    await executeFullPipeline(weekStart, config, onProgress)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    onProgress({
      status: 'error',
      totalDays: 0,
      completedDays: 0,
      logs: [{ timestamp: new Date(), level: 'error', message: `Scheduler run failed: ${errorMsg}` }],
      error: errorMsg,
    })
  } finally {
    running = false
    notifyStatus()
  }
}

export function startScheduler(): void {
  if (checkInterval) return
  checkInterval = setInterval(tick, 60_000)
  notifyStatus()
}

export function stopScheduler(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

export function restartScheduler(): void {
  stopScheduler()
  const config = loadConfig()
  if (config.scheduler.enabled) {
    startScheduler()
  }
  notifyStatus()
}

export function isRunning(): boolean {
  return running
}

export function getStatus(): { enabled: boolean; nextRun?: string } {
  const config = loadConfig()
  return {
    enabled: config.scheduler.enabled,
    nextRun: config.scheduler.enabled
      ? getNextRunTime(config.scheduler.time, config.scheduler.skipWeekends)
      : undefined,
  }
}

export function onStatusChange(listener: StatusListener): () => void {
  statusListeners.push(listener)
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener)
  }
}

export function onProgressUpdate(listener: ProgressListener): () => void {
  progressListeners.push(listener)
  return () => {
    progressListeners = progressListeners.filter((l) => l !== listener)
  }
}
