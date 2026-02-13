import { loadConfig } from '../core/config'
import {
  collectWeekData,
  generateSummary,
  executeAutomation,
  executeFullPipeline,
} from '../core/orchestrator'
import type { AutomationProgress } from '../core/types'

function parseArgs(): { weekStart: string; previewOnly: boolean; autoRun: boolean } {
  const args = process.argv.slice(2)
  let weekStart = ''
  let previewOnly = false
  let autoRun = false

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--week' || args[i] === '-w') && args[i + 1]) {
      weekStart = args[i + 1]
      i++
    } else if (args[i] === '--preview') {
      previewOnly = true
    } else if (args[i] === '--auto') {
      autoRun = true
    } else if (args[i] === '--help' || args[i] === '-h') {
      printUsage()
      process.exit(0)
    }
  }

  if (!weekStart) {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
    weekStart = monday.toISOString().split('T')[0]
  }

  return { weekStart, previewOnly, autoRun }
}

function printUsage(): void {
  console.log(`
업무일지 자동화 CLI

Usage:
  bun run src/cli/index.ts [options]

Options:
  --week, -w <YYYY-MM-DD>  Week start date (Monday). Default: current week
  --preview                Only collect data and generate summaries (no automation)
  --auto                   Run full pipeline without confirmation
  --help, -h               Show this help
  `)
}

function onProgress(progress: AutomationProgress): void {
  const latest = progress.logs[progress.logs.length - 1]
  if (latest) {
    const icon = { info: 'ℹ', warn: '⚠', error: '✗', success: '✓' }[latest.level]
    console.log(`  ${icon} ${latest.message}`)
  }
}

async function main(): Promise<void> {
  console.log('업무일지 자동화 CLI')
  console.log('==================\n')

  const { weekStart, previewOnly, autoRun } = parseArgs()
  const config = loadConfig()

  if (!config.remote.email || !config.remote.password) {
    console.error('Remote.com credentials not configured. Set REMOTE_EMAIL and REMOTE_PASSWORD in .env')
    process.exit(1)
  }

  console.log(`Week: ${weekStart}\n`)

  if (autoRun) {
    console.log('[Full Pipeline Mode]\n')
    await executeFullPipeline(weekStart, config, onProgress)
    return
  }

  console.log('[Step 1] Collecting data...\n')
  const weekData = await collectWeekData(weekStart, config, onProgress)

  console.log('\n[Step 2] Generating summaries...\n')
  const summary = await generateSummary(weekData, config, onProgress)

  console.log('\n--- Preview ---\n')
  for (const day of summary.days) {
    console.log(`${day.date}:`)
    console.log(`  AM: ${day.amNotes}`)
    console.log(`  PM: ${day.pmNotes}`)
    console.log()
  }

  if (previewOnly) {
    console.log('Preview mode - skipping automation.')
    return
  }

  console.log('[Step 3] Running automation...\n')
  await executeAutomation(summary, config, onProgress)

  console.log('\nDone!')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
