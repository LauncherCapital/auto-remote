/**
 * Playwright 자동화 단독 테스트 스크립트
 * Usage: node test-automation.cjs [--headless]
 */
import { automateTimesheet } from './src/core/automation/remote'
import { loadConfig } from './src/core/config'
import { getAuthStatePath } from './src/core/config'
import type { WeeklySummary, AutomationProgress } from './src/core/types'

const MOCK_SUMMARY: WeeklySummary = {
  weekStart: '2026-02-23',
  weekEnd: '2026-02-27',
  days: [
    {
      date: '2026-02-23',
      amNotes: '오전 업무: 코드 리뷰 및 PR 검토, 팀 스탠드업 미팅 참석',
      pmNotes: '오후 업무: 기능 개발 (사용자 인증 모듈), 단위 테스트 작성',
    },
    {
      date: '2026-02-24',
      amNotes: '오전 업무: 백엔드 API 설계 문서 작성, 데이터베이스 스키마 검토',
      pmNotes: '오후 업무: API 엔드포인트 구현, 통합 테스트 실행',
    },
    {
      date: '2026-02-25',
      amNotes: '오전 업무: 버그 수정 (#123, #124), QA 팀과 이슈 논의',
      pmNotes: '오후 업무: 릴리즈 준비, 배포 스크립트 검토 및 스테이징 환경 배포',
    },
    {
      date: '2026-02-26',
      amNotes: '오전 업무: 스프린트 회고 미팅, 다음 스프린트 계획 수립',
      pmNotes: '오후 업무: 신규 기능 프로토타이핑, 기술 문서 업데이트',
    },
    {
      date: '2026-02-27',
      amNotes: '오전 업무: 코드 리팩토링, 성능 최적화 분석',
      pmNotes: '오후 업무: 팀 코드 리뷰, 다음 주 작업 우선순위 정리',
    },
  ],
}

function onProgress(progress: AutomationProgress): void {
  const latest = progress.logs[progress.logs.length - 1]
  if (latest) {
    const icon = { info: 'ℹ', warn: '⚠', error: '✗', success: '✓' }[latest.level]
    const time = new Date(latest.timestamp).toLocaleTimeString('ko-KR')
    console.log(`  [${time}] ${icon} ${latest.message}`)
  }
  if (progress.currentDay) {
    // already logged via message
  }
}

async function main() {
  console.log('🤖 Playwright 자동화 테스트')
  console.log('===========================\n')

  const config = loadConfig()

  if (!config.remote.email || !config.remote.password) {
    console.error('❌ Remote.com 인증 정보가 없습니다.')
    console.error('   .env 파일에 REMOTE_EMAIL, REMOTE_PASSWORD를 설정하세요.')
    process.exit(1)
  }

  console.log(`📧 계정: ${config.remote.email}`)
  console.log(`🖥️  헤드리스: ${config.general.headless}`)
  console.log(`📅 주간: ${MOCK_SUMMARY.weekStart} ~ ${MOCK_SUMMARY.weekEnd}\n`)
  console.log('목업 요약 데이터:')
  for (const day of MOCK_SUMMARY.days) {
    console.log(`  ${day.date}: AM="${day.amNotes.slice(0, 40)}..." PM="${day.pmNotes.slice(0, 40)}..."`)
  }

  console.log('\n[자동화 시작]\n')

  try {
    await automateTimesheet(
      MOCK_SUMMARY,
      config.remote,
      config.general,
      getAuthStatePath(),
      onProgress
    )
    console.log('\n✅ 자동화 완료!')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`\n❌ 자동화 실패: ${msg}`)
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
