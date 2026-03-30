import { input, password, confirm } from '@inquirer/prompts'
import { loadConfig, saveEnvValue, saveJsonConfig } from '../core/config'
import { connectSlack, connectGitHub } from './oauth'
import type { GitHubRepo } from '../core/types'

export async function runSetup(): Promise<void> {
  console.log('업무일지 자동화 초기 설정')
  console.log('===========================\n')

  // 1. Remote.com credentials
  console.log('[1] Remote.com 계정\n')
  const remoteEmail = await input({
    message: 'Remote.com 이메일:',
    validate: (v) => v.includes('@') || '유효한 이메일을 입력하세요',
  })
  const remotePassword = await password({
    message: 'Remote.com 비밀번호:',
    mask: '*',
    validate: (v) => v.length > 0 || '비밀번호를 입력하세요',
  })
  saveEnvValue('REMOTE_EMAIL', remoteEmail)
  saveEnvValue('REMOTE_PASSWORD', remotePassword)
  console.log('✓ Remote.com 저장\n')

  // 2. OpenRouter API key
  console.log('[2] AI API (OpenRouter)\n')
  const openRouterKey = await password({
    message: 'OpenRouter API Key (sk-or-...):',
    mask: '*',
    validate: (v) => v.length > 0 || 'API 키를 입력하세요',
  })
  saveEnvValue('OPENROUTER_API_KEY', openRouterKey)
  console.log('✓ OpenRouter 저장\n')

  // 3. Slack OAuth
  console.log('[3] Slack 연결\n')
  const connectSlackNow = await confirm({ message: 'Slack을 연결하시겠습니까?' })
  if (connectSlackNow) {
    try {
      const slack = await connectSlack()
      saveEnvValue('SLACK_USER_TOKEN', slack.token)
      saveEnvValue('SLACK_USER_ID', slack.userId)
      if (slack.userName) saveEnvValue('SLACK_USER_NAME', slack.userName)
      console.log(`✓ Slack 연결 완료 (${slack.userName || slack.userId})\n`)
    } catch (err) {
      console.error(`✗ Slack 연결 실패: ${err instanceof Error ? err.message : err}\n`)
    }
  } else {
    console.log('건너뜀\n')
  }

  // 4. GitHub OAuth
  console.log('[4] GitHub 연결\n')
  const connectGitHubNow = await confirm({ message: 'GitHub을 연결하시겠습니까?' })
  if (connectGitHubNow) {
    try {
      const github = await connectGitHub()
      saveJsonConfig({ github: { accessToken: github.token, username: github.username } })
      console.log(`✓ GitHub 연결 완료 (${github.username})\n`)
    } catch (err) {
      console.error(`✗ GitHub 연결 실패: ${err instanceof Error ? err.message : err}\n`)
    }
  } else {
    console.log('건너뜀\n')
  }

  // 5. GitHub repos
  const config = loadConfig()
  if (config.github.accessToken) {
    console.log('[5] GitHub 레포지토리 설정\n')
    const repoInput = await input({
      message: '레포지토리 (owner/name, 쉼표로 구분):',
      default: '',
    })
    if (repoInput.trim()) {
      const repos: GitHubRepo[] = repoInput
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
        .map((r) => {
          const [owner, name] = r.split('/')
          return { owner: owner ?? r, name: name ?? '' }
        })
        .filter((r) => r.name)
      saveJsonConfig({ github: { repos } })
      console.log(`✓ 레포지토리 ${repos.length}개 저장\n`)
    }
  }

  console.log('='.repeat(30))
  console.log('설정 완료!')
  console.log('\nauto-remote run 으로 업무일지를 채울 수 있습니다.\n')
}
