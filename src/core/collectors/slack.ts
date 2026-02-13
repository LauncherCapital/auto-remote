import { WebClient } from '@slack/web-api'
import type { SlackMessage, SlackConfig } from '../types'

export async function collectSlackMessages(
  config: SlackConfig,
  date: string
): Promise<SlackMessage[]> {
  if (!config.userToken || !config.userId) {
    console.warn('Slack token or userId is missing, returning empty array')
    return []
  }

  const client = new WebClient(config.userToken)
  const messages: SlackMessage[] = []

  try {
    let page = 1
    let hasMore = true

    while (hasMore) {
      const result = await client.search.messages({
        query: `from:<@${config.userId}> on:${date}`,
        count: 100,
        page,
      })

      if (!result.messages?.matches) {
        break
      }

      for (const match of result.messages.matches) {
        if (match.type !== 'message') continue

        const channelId = match.channel?.id || ''
        const channelName = match.channel?.name || ''
        const text = match.text || ''
        const ts = match.ts || ''
        const permalink = match.permalink || undefined

        if (ts) {
          const timestamp = new Date(parseFloat(ts) * 1000)
          messages.push({
            text,
            channel: channelId,
            channelName,
            timestamp,
            permalink,
          })
        }
      }

      const totalPages = result.messages.paging?.pages || 1
      hasMore = page < totalPages
      page++
    }

    messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    return messages
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'slack_webapi_rate_limited') {
        console.warn('Slack API rate limit reached, returning partial results')
        return messages
      }
    }

    console.warn('Failed to fetch Slack messages:', error)
    return []
  }
}
