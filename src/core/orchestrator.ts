import type {
  AppConfig,
  WeeklyWorkData,
  WeeklySummary,
  DailyWorkData,
  DailySummary,
  AutomationProgress,
  LogEntry,
} from './types'
import { collectGitCommits } from './collectors/git'
import { collectSlackMessages } from './collectors/slack'
import { summarizeDay } from './ai/summarizer'
import { automateTimesheet } from './automation/remote'
import { getAuthStatePath } from './config'

function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart)
  const dates: string[] = []
  for (let i = 0; i < 5; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    dates.push(`${yyyy}-${mm}-${dd}`)
  }
  return dates
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export async function collectWeekData(
  weekStart: string,
  config: AppConfig,
  onProgress?: (progress: AutomationProgress) => void
): Promise<WeeklyWorkData> {
  const dates = getWeekDates(weekStart)
  const logs: LogEntry[] = []

  function log(level: LogEntry['level'], message: string): void {
    logs.push({ timestamp: new Date(), level, message })
    onProgress?.({
      status: 'collecting',
      totalDays: dates.length,
      completedDays: 0,
      logs: [...logs],
    })
  }

  log('info', `Collecting data for week ${weekStart}`)

  const days: DailyWorkData[] = []

  for (const date of dates) {
    log('info', `Collecting data for ${date}`)

    const [commits, slackMessages] = await Promise.all([
      collectGitCommits(config.github, date),
      collectSlackMessages(config.slack, date),
    ])

    const dayOfWeek = DAY_NAMES[new Date(date).getDay()]

    days.push({ date, dayOfWeek, commits, slackMessages })

    log('info', `${date}: ${commits.length} commits, ${slackMessages.length} messages`)
  }

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  return { weekStart, weekEnd: weekEndStr, days }
}

export async function generateSummary(
  data: WeeklyWorkData,
  config: AppConfig,
  onProgress?: (progress: AutomationProgress) => void
): Promise<WeeklySummary> {
  const logs: LogEntry[] = []

  function log(level: LogEntry['level'], message: string): void {
    logs.push({ timestamp: new Date(), level, message })
    onProgress?.({
      status: 'summarizing',
      totalDays: data.days.length,
      completedDays: 0,
      logs: [...logs],
    })
  }

  log('info', 'Generating AI summaries')

  const summaries: DailySummary[] = []

  for (const day of data.days) {
    log('info', `Summarizing ${day.date}`)
    const summary = await summarizeDay(config.ai, day)
    summaries.push(summary)
    log('success', `${day.date}: AM="${summary.amNotes.slice(0, 50)}..." PM="${summary.pmNotes.slice(0, 50)}..."`)
  }

  return {
    weekStart: data.weekStart,
    weekEnd: data.weekEnd,
    days: summaries,
  }
}

export async function executeAutomation(
  summary: WeeklySummary,
  config: AppConfig,
  onProgress?: (progress: AutomationProgress) => void
): Promise<void> {
  await automateTimesheet(
    summary,
    config.remote,
    config.general,
    getAuthStatePath(),
    onProgress
  )
}

export async function executeFullPipeline(
  weekStart: string,
  config: AppConfig,
  onProgress?: (progress: AutomationProgress) => void
): Promise<WeeklySummary> {
  const weekData = await collectWeekData(weekStart, config, onProgress)
  const summary = await generateSummary(weekData, config, onProgress)
  await executeAutomation(summary, config, onProgress)
  return summary
}
