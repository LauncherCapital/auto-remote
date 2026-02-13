import type { GitCommit, GitHubConfig } from '../types'

export async function collectGitCommits(
  config: GitHubConfig,
  date: string
): Promise<GitCommit[]> {
  if (!config.accessToken) {
    console.warn('GitHub access token is empty, skipping commit collection')
    return []
  }

  const allCommits: GitCommit[] = []
  const since = `${date}T00:00:00Z`
  const until = `${date}T23:59:59Z`

  for (const repo of config.repos) {
    try {
      const url = new URL(
        `https://api.github.com/repos/${repo.owner}/${repo.name}/commits`
      )
      url.searchParams.set('author', config.username)
      url.searchParams.set('since', since)
      url.searchParams.set('until', until)
      url.searchParams.set('per_page', '100')

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'work-log-automation',
        },
      })

      if (!response.ok) {
        console.warn(
          `GitHub API error for ${repo.owner}/${repo.name}: ${response.status} ${response.statusText}, skipping`
        )
        continue
      }

      const commits = (await response.json()) as Array<{
        sha: string
        commit: {
          message: string
          author: {
            date: string
          }
        }
      }>

      for (const commit of commits) {
        allCommits.push({
          hash: commit.sha,
          message: commit.commit.message,
          timestamp: new Date(commit.commit.author.date),
          repo: `${repo.owner}/${repo.name}`,
        })
      }
    } catch (error) {
      console.warn(
        `Error fetching commits for ${repo.owner}/${repo.name}: ${error}, skipping`
      )
    }
  }

  return allCommits.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}
