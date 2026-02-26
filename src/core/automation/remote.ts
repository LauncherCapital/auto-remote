import { chromium, type Page, type Locator } from 'playwright'
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

// ─── Time slot definitions ────────────────────────────────────────────────────
// 09:00-12:00 오전 근무 / 12:00-13:00 점심 브레이크 / 13:00-18:00 오후 근무

interface TimeSlot {
  id: 'am' | 'break' | 'pm'
  start: string
  end: string
  entryType: 'regular' | 'break'
  getNotes: (day: DailySummary) => string
}

const TIME_SLOTS: TimeSlot[] = [
  { id: 'am',    start: '09:00', end: '12:00', entryType: 'regular', getNotes: (d) => d.amNotes },
  { id: 'break', start: '12:00', end: '13:00', entryType: 'break',   getNotes: () => '' },
  { id: 'pm',    start: '13:00', end: '18:00', entryType: 'regular', getNotes: (d) => d.pmNotes },
]

// Time range strings to try when looking for existing Edit buttons
const EDIT_RANGES: Record<string, string[]> = {
  am:    ['09:00 to 12:00', '9:00 to 12:00'],
  break: ['12:00 to 13:00'],
  pm:    ['13:00 to 18:00', '13:00 to 17:00', '14:00 to 18:00'],
}

// Work type label text that Remote.com might show in its dropdown
const TYPE_LABELS: Record<string, string[]> = {
  regular: ['Regular hours', 'Regular', 'Work hours', 'Working hours', 'Work'],
  break:   ['Break', 'Lunch break', 'Lunch', 'Break time'],
}

const ENTRY_DELAY_MS = 500

// ─── Main export ──────────────────────────────────────────────────────────────

export async function automateTimesheet(
  summary: WeeklySummary,
  remoteConfig: RemoteConfig,
  generalConfig: GeneralConfig,
  authStatePath: string,
  onProgress?: (progress: AutomationProgress) => void,
  signal?: AbortSignal
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

    // Navigate to the correct week
    await navigateToWeek(page, summary.weekStart, log)

    // Reopen timesheet if it's in submitted state
    log('info', 'Checking timesheet state')
    const reopenButton = page.locator(SELECTORS.reopenButton)
    if (await reopenButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await reopenButton.click()
      await page.waitForTimeout(3000) // Give time for UI to update after reopen
      log('success', 'Timesheet reopened')
    } else {
      log('info', 'Timesheet already open for editing')
    }

    let completedDays = 0

    for (const day of workdays) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')

      emitProgress('automating', { currentDay: day.date, completedDays })
      log('info', `Processing ${day.date}`)

      let anyFilled = false
      for (const slot of TIME_SLOTS) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
        const filled = await processSlot(page, day, slot, logs)
        if (filled) anyFilled = true
      }

      if (anyFilled) {
        log('success', `Completed ${day.date}`)
      } else {
        log('warn', `No entries filled for ${day.date}`)
      }

      completedDays++
      emitProgress('automating', { completedDays })
    }

    // Resubmit timesheet
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

// ─── Week navigation ──────────────────────────────────────────────────────────

async function navigateToWeek(
  page: Page,
  targetWeekStart: string,
  log: (level: LogEntry['level'], msg: string) => void
): Promise<void> {
  // Calculate how many weeks to go back (or forward) from current week
  const target = new Date(targetWeekStart + 'T12:00:00')
  const now = new Date()
  const currentDay = now.getDay()
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay
  const currentMonday = new Date(now)
  currentMonday.setDate(now.getDate() + mondayOffset)
  currentMonday.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)

  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const weeksDiff = Math.round((currentMonday.getTime() - target.getTime()) / msPerWeek)

  if (weeksDiff > 0) {
    log('info', `Navigating ${weeksDiff} week(s) back to ${targetWeekStart}`)
    for (let i = 0; i < weeksDiff; i++) {
      await page.locator(SELECTORS.prevWeekButton).click()
      await page.waitForTimeout(1500)
    }
  } else if (weeksDiff < 0) {
    log('info', `Navigating ${Math.abs(weeksDiff)} week(s) forward to ${targetWeekStart}`)
    for (let i = 0; i < Math.abs(weeksDiff); i++) {
      await page.locator(SELECTORS.nextWeekButton).click()
      await page.waitForTimeout(1500)
    }
  } else {
    log('info', 'Already on the correct week')
  }
}

// ─── Slot processing (Edit existing OR Add new) ───────────────────────────────

async function processSlot(
  page: Page,
  day: DailySummary,
  slot: TimeSlot,
  logs: LogEntry[]
): Promise<boolean> {
  const notes = slot.getNotes(day)

  // 1. Try to find an existing Edit button for this time range
  const editRanges = EDIT_RANGES[slot.id]
  for (const timeRange of editRanges) {
    const editBtn = page.locator(SELECTORS.editEntryButton(timeRange))
    if (await editBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      try {
        return await retryOperation(async () => {
          await editBtn.click()
          const dialog = page.locator(SELECTORS.editDialog)
          await dialog.waitFor({ state: 'visible', timeout: TIMEOUTS.modalAppear })

          const notesField = dialog.getByPlaceholder('Add notes')
          await notesField.waitFor({ state: 'visible', timeout: 3000 })
          await notesField.clear()
          if (notes) await notesField.fill(notes)

          await page.locator(SELECTORS.saveButton).click()
          await dialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.modalDisappear })
          await page.waitForTimeout(ENTRY_DELAY_MS)
          return true
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logs.push({ timestamp: new Date(), level: 'error', message: `Failed to edit ${slot.id} for ${day.date}: ${msg}` })
        const dismissBtn = page.locator(SELECTORS.dismissButton)
        if (await dismissBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await dismissBtn.click()
          await page.waitForTimeout(300)
        }
        return false
      }
    }
  }

  // 2. No edit button found → try to add a new entry via "Add hours"
  return addNewEntry(page, day, slot, notes, logs)
}

// ─── Add new entry via "Add hours" button ─────────────────────────────────────

function getDayLabel(dateStr: string): string {
  // Remote.com shows dates as e.g. "Thursday, Feb 19"
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

async function addNewEntry(
  page: Page,
  day: DailySummary,
  slot: TimeSlot,
  notes: string,
  logs: LogEntry[]
): Promise<boolean> {
  const dayLabel = getDayLabel(day.date)

  try {
    return await retryOperation(async () => {
      // Find the "Add hours" button within this day's section.
      // Remote.com renders each day as a container with a header like "Thursday, Feb 19".
      // We traverse up from the matching text node to find the section, then look for the button inside.
      let addBtn: Locator | null = null

      // Strategy 1: find button near the day label text
      const candidates = page.locator('button:has-text("Add hours")')
      const count = await candidates.count()

      for (let i = 0; i < count; i++) {
        const btn = candidates.nth(i)
        // Check if this button's ancestor section contains the day label
        const ancestor = page.locator(`*:has-text("${dayLabel}")`).filter({ has: btn })
        if (await ancestor.count().then((c) => c > 0).catch(() => false)) {
          addBtn = btn
          break
        }
      }

      // Strategy 2: fallback — use the day's position in the week (0=Mon … 4=Fri)
      if (!addBtn) {
        const d = new Date(day.date + 'T12:00:00')
        const dayIndex = d.getDay() - 1 // Mon=0 … Fri=4
        if (dayIndex >= 0 && dayIndex < count) {
          addBtn = candidates.nth(dayIndex)
          logs.push({ timestamp: new Date(), level: 'warn', message: `Using positional fallback for Add hours (day index ${dayIndex}) on ${day.date}` })
        }
      }

      if (!addBtn || !(await addBtn.isVisible({ timeout: 500 }).catch(() => false))) {
        logs.push({ timestamp: new Date(), level: 'warn', message: `No Add hours button found for ${day.date} ${slot.id} — skipping` })
        return false
      }

      await addBtn.click()

      const dialog = page.locator(SELECTORS.editDialog)
      await dialog.waitFor({ state: 'visible', timeout: TIMEOUTS.modalAppear })
      await page.waitForTimeout(500)

      // Set work type (Regular / Break)
      await setEntryType(page, dialog, slot.entryType, logs)

      // Set start and end times
      await setTimeRange(dialog, slot.start, slot.end, logs)

      // Fill notes
      if (notes) {
        const notesField = dialog.getByPlaceholder('Add notes')
        if (await notesField.isVisible({ timeout: 2000 }).catch(() => false)) {
          await notesField.fill(notes)
        }
      }

      // Save
      await page.locator(SELECTORS.saveButton).click()
      await dialog.waitFor({ state: 'hidden', timeout: TIMEOUTS.modalDisappear })
      await page.waitForTimeout(ENTRY_DELAY_MS)

      return true
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logs.push({ timestamp: new Date(), level: 'error', message: `Failed to add ${slot.id} entry for ${day.date}: ${msg}` })
    const dismissBtn = page.locator(SELECTORS.dismissButton)
    if (await dismissBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await dismissBtn.click()
      await page.waitForTimeout(300)
    }
    return false
  }
}

// ─── Dialog helpers ───────────────────────────────────────────────────────────

async function setEntryType(
  page: Page,
  dialog: Locator,
  type: 'regular' | 'break',
  logs: LogEntry[]
): Promise<void> {
  const targetLabels = TYPE_LABELS[type]

  // Try <select> or combobox
  const combobox = dialog.getByRole('combobox').first()
  if (await combobox.isVisible({ timeout: 1000 }).catch(() => false)) {
    for (const label of targetLabels) {
      try {
        await combobox.selectOption({ label })
        return
      } catch { /* try next label */ }
    }
    // Open dropdown and pick option
    await combobox.click()
    await page.waitForTimeout(300)
    for (const label of targetLabels) {
      const option = page.getByRole('option', { name: new RegExp(label, 'i') })
      if (await option.isVisible({ timeout: 500 }).catch(() => false)) {
        await option.click()
        return
      }
    }
  }

  // Try radio buttons
  for (const label of targetLabels) {
    const radio = dialog.getByRole('radio', { name: new RegExp(label, 'i') })
    if (await radio.isVisible({ timeout: 500 }).catch(() => false)) {
      await radio.click()
      return
    }
  }

  logs.push({ timestamp: new Date(), level: 'warn', message: `Could not set entry type to "${type}", continuing with default` })
}

async function setTimeRange(
  dialog: Locator,
  start: string,
  end: string,
  logs: LogEntry[]
): Promise<void> {
  // Strategy 1: standard <input type="time">
  const timeInputs = dialog.locator('input[type="time"]')
  if (await timeInputs.count().then((c) => c >= 2).catch(() => false)) {
    await timeInputs.nth(0).fill(start)
    await timeInputs.nth(1).fill(end)
    return
  }

  // Strategy 2: labeled inputs
  const startInput = dialog.getByLabel(/start/i)
  const endInput = dialog.getByLabel(/end/i)
  if (await startInput.isVisible({ timeout: 500 }).catch(() => false)) {
    await startInput.fill(start)
  }
  if (await endInput.isVisible({ timeout: 500 }).catch(() => false)) {
    await endInput.fill(end)
    return
  }

  // Strategy 3: placeholder-based inputs (HH:MM)
  const startPh = dialog.getByPlaceholder(/HH:MM|start/i).first()
  const endPh = dialog.getByPlaceholder(/HH:MM|end/i).last()
  if (await startPh.isVisible({ timeout: 500 }).catch(() => false)) {
    await startPh.fill(start)
  }
  if (await endPh.isVisible({ timeout: 500 }).catch(() => false)) {
    await endPh.fill(end)
    return
  }

  logs.push({ timestamp: new Date(), level: 'warn', message: `Could not set time range ${start}-${end} — no time inputs found` })
}

// ─── Utilities ────────────────────────────────────────────────────────────────

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
      await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt)))
    }
  }
  throw new Error('Unreachable')
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + 'T12:00:00').getDay()
  return day === 0 || day === 6
}
