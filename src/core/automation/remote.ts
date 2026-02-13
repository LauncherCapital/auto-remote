import { chromium, type Page } from 'playwright'
import type {
  WeeklySummary,
  DailySummary,
  AutomationProgress,
  RemoteConfig,
  GeneralConfig,
  LogEntry,
} from '../types'
import { ensureAuthenticated } from './auth'
import { URLS, SELECTORS, TIMEOUTS } from './selectors'

const AM_TIME_RANGES = ['09:00 to 12:00', '9:00 to 12:00']
const PM_TIME_RANGES = ['13:00 to 18:00', '13:00 to 17:00', '14:00 to 18:00']
const ENTRY_DELAY_MS = 500

export async function automateTimesheet(
  summary: WeeklySummary,
  remoteConfig: RemoteConfig,
  generalConfig: GeneralConfig,
  authStatePath: string,
  onProgress?: (progress: AutomationProgress) => void
): Promise<void> {
  const logs: LogEntry[] = []
  const workdays = summary.days.filter((d) => !isWeekend(d.date))

  function emitProgress(
    status: AutomationProgress['status'],
    overrides: Partial<AutomationProgress> = {}
  ): void {
    if (!onProgress) return
    onProgress({
      status,
      totalDays: workdays.length,
      completedDays: 0,
      logs: [...logs],
      ...overrides,
    })
  }

  function log(level: LogEntry['level'], message: string): void {
    logs.push({ timestamp: new Date(), level, message })
    emitProgress('automating', { logs: [...logs] })
  }

  await ensureAuthenticated(remoteConfig, generalConfig, authStatePath)
  log('info', 'Authentication verified')

  const browser = await chromium.launch({
    headless: generalConfig.headless,
    slowMo: generalConfig.slowMo,
  })

  try {
    const context = await browser.newContext({ storageState: authStatePath })
    const page = await context.newPage()

    log('info', 'Navigating to time tracking page')
    await page.goto(URLS.timeTracking, { timeout: TIMEOUTS.navigation })
    await page.waitForTimeout(2000)

    log('info', 'Reopening timesheet')
    const reopenButton = page.locator(SELECTORS.reopenButton)
    if (await reopenButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reopenButton.click()
      await page.waitForTimeout(2000)
      log('success', 'Timesheet reopened')
    } else {
      log('info', 'Timesheet already open for editing')
    }

    let completedDays = 0

    for (const day of workdays) {
      emitProgress('automating', {
        currentDay: day.date,
        completedDays,
      })

      log('info', `Processing ${day.date}`)

      const amFilled = await fillEntry(page, day, 'am', logs)
      const pmFilled = await fillEntry(page, day, 'pm', logs)

      if (amFilled || pmFilled) {
        log('success', `Completed ${day.date}`)
      } else {
        log('warn', `No editable entries found for ${day.date}`)
      }

      completedDays++
      emitProgress('automating', { completedDays })
    }

    log('info', 'Resubmitting timesheet')
    const resubmitButton = page.locator(SELECTORS.resubmitButton)
    if (await resubmitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await resubmitButton.click()

      const resubmitHoursButton = page.locator(SELECTORS.resubmitHoursButton)
      await resubmitHoursButton.waitFor({ state: 'visible', timeout: TIMEOUTS.modalAppear })
      await resubmitHoursButton.click()
      await page.waitForTimeout(2000)
      log('success', 'Timesheet resubmitted')
    } else {
      log('warn', 'No resubmit button found - timesheet may not need resubmission')
    }

    await context.storageState({ path: authStatePath })
    await context.close()

    emitProgress('done', { completedDays: workdays.length })
    log('success', 'Automation completed successfully')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log('error', `Automation failed: ${errorMessage}`)
    emitProgress('error', { error: errorMessage })
    throw error
  } finally {
    await browser.close()
  }
}

async function fillEntry(
  page: Page,
  day: DailySummary,
  period: 'am' | 'pm',
  logs: LogEntry[]
): Promise<boolean> {
  const notes = period === 'am' ? day.amNotes : day.pmNotes
  const timeRanges = period === 'am' ? AM_TIME_RANGES : PM_TIME_RANGES

  for (const timeRange of timeRanges) {
    const editButton = page.locator(SELECTORS.editEntryButton(timeRange))
    const isVisible = await editButton.isVisible({ timeout: 1000 }).catch(() => false)

    if (!isVisible) continue

    try {
      return await retryOperation(async () => {
        await editButton.click()

        const dialog = page.locator(SELECTORS.editDialog)
        await dialog.waitFor({ state: 'visible', timeout: TIMEOUTS.modalAppear })

        const notesField = dialog.getByPlaceholder('Add notes')
        await notesField.waitFor({ state: 'visible', timeout: 3000 })
        await notesField.clear()
        await notesField.fill(notes)

        await page.locator(SELECTORS.saveButton).click()
        await dialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.modalDisappear })
        await page.waitForTimeout(ENTRY_DELAY_MS)

        return true
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logs.push({
        timestamp: new Date(),
        level: 'error',
        message: `Failed to fill ${period.toUpperCase()} entry for ${day.date}: ${msg}`,
      })

      const dismissButton = page.locator(SELECTORS.dismissButton)
      if (await dismissButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await dismissButton.click()
        await page.waitForTimeout(500)
      }
    }
  }

  return false
}

async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === maxRetries - 1) throw error
      const delay = baseDelay * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error('Unreachable')
}

function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr)
  const day = date.getDay()
  return day === 0 || day === 6
}
