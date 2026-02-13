// AI prompt templates - placeholder for Wave 2c

export const SYSTEM_PROMPT_KO = `당신은 업무일지 작성을 도와주는 AI 어시스턴트입니다.
주어진 Git 커밋 메시지와 Slack 메시지를 분석하여 간결한 업무내용 요약을 작성합니다.

규칙:
- 한국어로 작성
- 간결하고 전문적인 톤
- 업무 내용만 포함 (잡담, 인사 등 제외)
- 주요 작업 내용을 불릿 포인트로 요약
- 최대 3-5줄`

export const SYSTEM_PROMPT_EN = `You are an AI assistant helping to write work logs.
Analyze the given Git commit messages and Slack messages to create concise work summaries.

Rules:
- Write in English
- Use concise, professional tone
- Include only work-related content (exclude casual chat, greetings)
- Summarize key tasks as bullet points
- Maximum 3-5 lines`

export function buildUserPrompt(
  period: 'am' | 'pm',
  commits: Array<{ message: string; repo: string }>,
  messages: Array<{ text: string; channel: string }>,
  language: 'ko' | 'en'
): string {
  const periodLabel = language === 'ko'
    ? (period === 'am' ? '오전 (09:00-12:00)' : '오후 (13:00-18:00)')
    : (period === 'am' ? 'Morning (09:00-12:00)' : 'Afternoon (13:00-18:00)')

  let prompt = language === 'ko'
    ? `${periodLabel} 업무내용을 요약해주세요.\n\n`
    : `Summarize the ${periodLabel} work.\n\n`

  if (commits.length > 0) {
    prompt += language === 'ko' ? '## Git 커밋:\n' : '## Git Commits:\n'
    for (const c of commits) {
      prompt += `- [${c.repo}] ${c.message}\n`
    }
    prompt += '\n'
  }

  if (messages.length > 0) {
    prompt += language === 'ko' ? '## Slack 메시지:\n' : '## Slack Messages:\n'
    for (const m of messages) {
      prompt += `- [#${m.channel}] ${m.text}\n`
    }
    prompt += '\n'
  }

  if (commits.length === 0 && messages.length === 0) {
    prompt += language === 'ko'
      ? '(이 시간대에 기록된 활동이 없습니다)'
      : '(No recorded activity for this period)'
  }

  return prompt
}
