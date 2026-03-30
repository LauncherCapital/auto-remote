import { loadConfig } from '../core/config'
import {
  collectWeekData,
  generateSummary,
  executeAutomation,
} from '../core/orchestrator'
import type { AutomationProgress } from '../core/types'
import { runSetup } from './setup'

function getCurrentMonday(): string {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((day + 6) % 7))
  return monday.toISOString().split('T')[0]
}

function onProgress(progress: AutomationProgress): void {
  const latest = progress.logs[progress.logs.length - 1]
  if (latest) {
    const icon = { info: 'ℹ', warn: '⚠', error: '✗', success: '✓' }[latest.level]
    console.log(`  ${icon} ${latest.message}`)
  }
}

function printHelp(): void {
  console.log(`
업무일지 자동화 CLI

사용법:
  auto-remote <command> [options]

Commands:
  setup                   초기 설정 (인터랙티브)
  run [--week YYYY-MM-DD] 자동화 실행 (기본: 이번 주)
  preview [--week DATE]   미리보기만 (Remote.com 접속 없음)
  status                  현재 설정 및 연결 상태
  help                    이 도움말

Options:
  --week, -w <YYYY-MM-DD>  대상 주의 월요일 날짜

예시:
  auto-remote setup
  auto-remote run
  auto-remote run --week 2025-01-06
  auto-remote preview
`)
}

function printStatus(): void {
  const config = loadConfig()
  console.log('현재 설정 상태\n')
  console.log(`Remote.com: ${config.remote.email ? `✓ ${config.remote.email}` : '✗ 미설정'}`)
  console.log(`Slack:      ${config.slack.userToken ? `✓ ${config.slack.userName || config.slack.userId}` : '✗ 미설정'}`)
  console.log(`GitHub:     ${config.github.accessToken ? `✓ ${config.github.username} (레포 ${config.github.repos.length}개)` : '✗ 미설정'}`)
  console.log(`AI API:     ${config.ai.openRouterApiKey ? '✓ 설정됨' : '✗ 미설정'}`)
}

async function runAutomation(weekStart: string, previewOnly: boolean): Promise<void> {
  const config = loadConfig()

  if (!config.remote.email || !config.remote.password) {
    console.error('✗ Remote.com 계정이 설정되지 않았습니다.')
    console.error('  auto-remote setup 을 먼저 실행하세요.')
    process.exit(1)
  }

  console.log(`대상 주: ${weekStart}\n`)

  if (previewOnly) {
    console.log('[1/2] 데이터 수집 중...')
    const weekData = await collectWeekData(weekStart, config, onProgress)
    console.log('\n[2/2] AI 요약 생성 중...')
    const summary = await generateSummary(weekData, config, onProgress)
    console.log('\n--- 미리보기 ---\n')
    for (const day of summary.days) {
      console.log(`${day.date}:`)
      console.log(`  오전: ${day.amNotes || '(내용 없음)'}`)
      console.log(`  오후: ${day.pmNotes || '(내용 없음)'}`)
      console.log()
    }
    return
  }

  console.log('[1/3] 데이터 수집 중...')
  const weekData = await collectWeekData(weekStart, config, onProgress)
  console.log('\n[2/3] AI 요약 생성 중...')
  const summary = await generateSummary(weekData, config, onProgress)
  console.log('\n[3/3] Remote.com 자동 입력 중...')
  await executeAutomation(summary, config, onProgress)
  console.log('\n✓ 완료!')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === 'setup') {
    await runSetup()
    return
  }

  if (command === 'status') {
    printStatus()
    return
  }

  if (command === 'run' || command === 'preview') {
    const previewOnly = command === 'preview'
    let weekStart = getCurrentMonday()

    for (let i = 1; i < args.length; i++) {
      if ((args[i] === '--week' || args[i] === '-w') && args[i + 1]) {
        weekStart = args[i + 1]
        i++
      }
    }

    await runAutomation(weekStart, previewOnly)
    return
  }

  console.error(`알 수 없는 명령어: ${command}`)
  console.error("'auto-remote help' 로 사용법을 확인하세요.")
  process.exit(1)
}

main().catch((error) => {
  console.error('오류:', error instanceof Error ? error.message : error)
  process.exit(1)
})
