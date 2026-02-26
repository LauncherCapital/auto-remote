import type { GitCommit, GitHubConfig } from '../types'

// GitHub API가 반환하는 커밋 응답 타입
interface GitHubCommitResponse {
  sha: string
  commit: {
    message: string
    author: {
      name: string
      email: string  // 실제 git commit에 박힌 이메일 (계정 인증 여부 무관)
      date: string
    }
  }
  author: {           // GitHub 계정 (이메일이 계정과 연결 안 된 경우 null)
    login: string
  } | null
}

export async function collectGitCommits(
  config: GitHubConfig,
  date: string
): Promise<GitCommit[]> {
  if (!config.accessToken) {
    console.warn('GitHub access token is empty, skipping commit collection')
    return []
  }

  if (!config.username && !config.authorEmail) {
    console.warn('GitHub username/authorEmail not configured, skipping commit collection')
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

      // authorEmail이 있으면 API 필터 없이 전체 조회 후 클라이언트 필터링
      // → git commit에 직접 박힌 이메일 기준이므로 username 불일치 커밋도 포함
      // authorEmail이 없으면 GitHub username으로 API 수준 필터링 (기존 방식)
      if (!config.authorEmail && config.username) {
        url.searchParams.set('author', config.username)
      }

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

      const commits = (await response.json()) as GitHubCommitResponse[]

      for (const commit of commits) {
        // 이메일 기반 필터링: 실제 커밋에 박힌 이메일로 판단
        if (config.authorEmail) {
          const commitEmail = commit.commit.author.email.toLowerCase()
          const targetEmail = config.authorEmail.toLowerCase()
          if (commitEmail !== targetEmail) continue
        }

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
