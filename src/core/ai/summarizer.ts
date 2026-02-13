import type { DailyWorkData, DailySummary, AIConfig, GitCommit, SlackMessage } from '../types'
import { SYSTEM_PROMPT_KO, SYSTEM_PROMPT_EN, buildUserPrompt } from './prompts'

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

async function callOpenRouter(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as OpenRouterResponse

    if (!data.choices || data.choices.length === 0 || !data.choices[0].message?.content) {
      throw new Error('Empty response from OpenRouter API')
    }

    return data.choices[0].message.content
  } catch (error) {
    console.error('OpenRouter API call failed:', error)
    throw error
  }
}

function splitDataByPeriod(data: DailyWorkData): {
  amCommits: GitCommit[]
  pmCommits: GitCommit[]
  amMessages: SlackMessage[]
  pmMessages: SlackMessage[]
} {
  const amCommits: GitCommit[] = []
  const pmCommits: GitCommit[] = []
  const amMessages: SlackMessage[] = []
  const pmMessages: SlackMessage[] = []

  for (const commit of data.commits) {
    if (commit.timestamp.getHours() < 12) {
      amCommits.push(commit)
    } else {
      pmCommits.push(commit)
    }
  }

  for (const message of data.slackMessages) {
    if (message.timestamp.getHours() < 12) {
      amMessages.push(message)
    } else {
      pmMessages.push(message)
    }
  }

  return { amCommits, pmCommits, amMessages, pmMessages }
}

export async function summarizeDay(
  config: AIConfig,
  data: DailyWorkData
): Promise<DailySummary> {
  const systemPrompt = config.language === 'ko' ? SYSTEM_PROMPT_KO : SYSTEM_PROMPT_EN
  const defaultNotes = config.language === 'ko' ? '일반 업무' : 'General work'

  const { amCommits, pmCommits, amMessages, pmMessages } = splitDataByPeriod(data)

  let amNotes = defaultNotes
  let pmNotes = defaultNotes

  if (amCommits.length > 0 || amMessages.length > 0) {
    try {
      const amPrompt = buildUserPrompt(
        'am',
        amCommits.map(c => ({ message: c.message, repo: c.repo })),
        amMessages.map(m => ({ text: m.text, channel: m.channelName })),
        config.language
      )
      amNotes = await callOpenRouter(config, systemPrompt, amPrompt)
    } catch (error) {
      console.error('Failed to generate AM summary:', error)
      amNotes = defaultNotes
    }
  }

  if (pmCommits.length > 0 || pmMessages.length > 0) {
    try {
      const pmPrompt = buildUserPrompt(
        'pm',
        pmCommits.map(c => ({ message: c.message, repo: c.repo })),
        pmMessages.map(m => ({ text: m.text, channel: m.channelName })),
        config.language
      )
      pmNotes = await callOpenRouter(config, systemPrompt, pmPrompt)
    } catch (error) {
      console.error('Failed to generate PM summary:', error)
      pmNotes = defaultNotes
    }
  }

  return {
    date: data.date,
    amNotes,
    pmNotes,
    rawAmData: { commits: amCommits, messages: amMessages },
    rawPmData: { commits: pmCommits, messages: pmMessages },
  }
}
