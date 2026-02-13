# 업무일지 자동화 - Implementation Plan

## Architecture Overview

```
업무일지 자동화/
├── package.json                    # Independent project, Bun runtime
├── tsconfig.json                   # Strict, ES2020
├── tsconfig.node.json              # Node/Main process config
├── tsconfig.web.json               # Renderer config
├── electron.vite.config.ts         # electron-vite build config
├── tailwind.config.js              # Tailwind CSS
├── postcss.config.js               # PostCSS for Tailwind
├── .env                            # Credentials (gitignored)
├── .env.example                    # Template
├── .gitignore
├── config.json                     # User settings (gitignored)
├── config.example.json             # Template
├── auth.json                       # Playwright session state (gitignored)
│
├── src/
│   ├── core/                       # Shared core logic (used by both CLI and Electron)
│   │   ├── config.ts               # Configuration loader (.env + config.json)
│   │   ├── types.ts                # Shared TypeScript types/interfaces
│   │   ├── collectors/
│   │   │   ├── git.ts              # Git commit log collector
│   │   │   ├── slack.ts            # Slack message collector
│   │   │   └── index.ts            # Collector orchestrator
│   │   ├── ai/
│   │   │   ├── summarizer.ts       # OpenRouter AI summarizer
│   │   │   └── prompts.ts          # AI prompt templates
│   │   ├── automation/
│   │   │   ├── remote.ts           # Playwright Remote.com automation
│   │   │   ├── auth.ts             # Login & session management
│   │   │   └── selectors.ts        # UI selectors/constants
│   │   └── orchestrator.ts         # Main pipeline: collect → summarize → automate
│   │
│   ├── cli/
│   │   └── index.ts                # CLI entry point (bun run cli)
│   │
│   ├── main/                       # Electron main process
│   │   ├── index.ts                # Main entry, window creation
│   │   └── ipc.ts                  # IPC handlers (bridge core → renderer)
│   │
│   ├── preload/
│   │   ├── index.ts                # Preload script
│   │   └── index.d.ts              # Type declarations for exposed API
│   │
│   └── renderer/                   # Electron renderer (React)
│       ├── index.html              # HTML entry
│       ├── main.tsx                # React entry
│       ├── App.tsx                 # Root component
│       ├── global.css              # Tailwind imports + global styles
│       ├── components/
│       │   ├── Layout.tsx          # App shell with sidebar nav
│       │   ├── Settings.tsx        # Settings form
│       │   ├── Preview.tsx         # Weekly preview with AI summaries
│       │   ├── Execute.tsx         # Execute automation + log view
│       │   └── common/
│       │       ├── Button.tsx
│       │       ├── Input.tsx
│       │       ├── Card.tsx
│       │       └── StatusBadge.tsx
│       └── hooks/
│           ├── useSettings.ts      # Settings state management
│           └── useAutomation.ts    # Automation execution state
│
└── resources/                      # Electron app resources
    └── icon.png                    # App icon
```

---

## Module Specifications

### 1. `src/core/types.ts` — Shared Types

```typescript
// Key interfaces
interface AppConfig {
  remote: { email: string; password: string };
  slack: { userToken: string; userId: string };
  git: { repos: string[]; authorEmail: string };
  ai: { openRouterApiKey: string; model: string };
  general: { language: 'ko' | 'en'; timezone: string };
}

interface DailyWorkData {
  date: string; // YYYY-MM-DD
  commits: GitCommit[];
  slackMessages: SlackMessage[];
}

interface GitCommit {
  hash: string;
  message: string;
  timestamp: Date; // For AM/PM splitting
  repo: string;
}

interface SlackMessage {
  text: string;
  channel: string;
  timestamp: Date; // For AM/PM splitting
}

interface DailySummary {
  date: string;
  amNotes: string; // Morning summary (before 12:00)
  pmNotes: string; // Afternoon summary (after 12:00)
}

interface AutomationProgress {
  status: 'idle' | 'collecting' | 'summarizing' | 'automating' | 'done' | 'error';
  currentDay?: string;
  totalDays: number;
  completedDays: number;
  logs: LogEntry[];
  error?: string;
}

interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
}
```

### 2. `src/core/collectors/git.ts` — Git Collector

- Uses `Bun.spawn` (or `child_process.exec`) to run `git log`
- Iterates over configured repo paths
- Filters by `--after`, `--before`, `--author`
- Parses output with `--pretty=format:"%H|%s|%aI"` (hash|subject|ISO timestamp)
- Returns `GitCommit[]` per day

### 3. `src/core/collectors/slack.ts` — Slack Collector

- Uses `@slack/web-api` WebClient with User Token
- Primary: `search.messages` with `from:<@userId> after:YYYY-MM-DD before:YYYY-MM-DD`
- Fallback: `conversations.history` per channel + client-side filter
- Handles pagination and rate limits
- Returns `SlackMessage[]` per day

### 4. `src/core/ai/summarizer.ts` — AI Summarizer

- Calls OpenRouter API (`https://openrouter.ai/api/v1/chat/completions`)
- Splits data into AM (before 12:00) and PM (after 12:00)
- Generates separate Korean summaries for AM and PM
- Prompt template focuses on concise, professional work descriptions
- Returns `DailySummary` per day

### 5. `src/core/automation/remote.ts` — Playwright Automation

- Full workflow: login → navigate → reopen → edit entries → save → resubmit
- Uses `storageState` for session persistence
- Handles re-login on session expiry
- Skips PTO days, weekends
- Fills AM notes in morning entry, PM notes in afternoon entry
- Retry logic with exponential backoff
- Emits progress events for UI updates

### 6. `src/core/orchestrator.ts` — Pipeline Orchestrator

```typescript
async function execute(weekStartDate: string, config: AppConfig,
  onProgress: (progress: AutomationProgress) => void): Promise<void> {
  // 1. Collect data for Mon-Fri
  // 2. Summarize each day with AI (AM/PM split)
  // 3. Preview summaries (return for GUI confirmation)
  // 4. Run Playwright automation
  // 5. Report completion
}
```

---

## Implementation Waves

### Wave 1: Project Scaffold
- **Task**: Initialize project with all config files, folder structure, dependencies
- **Deps**: None
- **Category**: `quick`
- **Output**: Buildable empty project

### Wave 2: Core Modules (ALL PARALLEL)

| Task | Category | Skills | Deps |
|------|----------|--------|------|
| 2a. Git collector | `unspecified-low` | — | Wave 1 |
| 2b. Slack collector | `unspecified-low` | — | Wave 1 |
| 2c. AI summarizer | `unspecified-low` | — | Wave 1 |
| 2d. Playwright automation | `deep` | `playwright` | Wave 1 |
| 2e. Config + types | `quick` | — | Wave 1 |

### Wave 3: Core Orchestrator + CLI
- **Task**: Wire all modules together, create CLI entry point
- **Deps**: Wave 2 all complete
- **Category**: `unspecified-high`
- **Output**: Working CLI: `bun run src/cli/index.ts --week 2026-02-10`

### Wave 4: Electron App (PARALLEL)

| Task | Category | Skills | Deps |
|------|----------|--------|------|
| 4a. Main process + IPC | `unspecified-high` | — | Wave 3 |
| 4b. Renderer UI | `visual-engineering` | `frontend-ui-ux` | Wave 3 |

### Wave 5: Integration & Verification
- **Task**: Build, test, verify end-to-end
- **Deps**: Wave 4 complete
- **Category**: `deep`
- **Output**: Working Electron app

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Playwright session expiry | High | Medium | Auto-detect 401, re-login flow |
| Remote.com UI changes | Medium | High | Selectors in constants file, easy to update |
| Slack rate limits | Low | Low | Built-in retry in @slack/web-api |
| OpenRouter API errors | Low | Medium | Retry + fallback model |
| Electron + Playwright bundling | Medium | High | Test early, use separate Playwright install if bundling fails |
| AM/PM split accuracy | Medium | Low | Timestamp-based, fallback to full-day summary |

---

## Success Criteria

1. **CLI Mode**: `bun run src/cli/index.ts --week 2026-02-10` successfully fills notes
2. **Electron App**: Opens, shows settings, previews summaries, executes automation
3. **Git Collector**: Fetches commits from configured repos for date range
4. **Slack Collector**: Fetches user's messages for date range
5. **AI Summary**: Generates Korean work summaries split into AM/PM
6. **Playwright**: Logs in, reopens timesheet, fills notes, saves, resubmits
7. **Build**: `bun run build` produces working Electron app
