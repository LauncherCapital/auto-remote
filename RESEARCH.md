# 업무일지 자동화 - Research Document

> Remote.com Time Tracking 업무내용(notes) 자동 입력 도구

## 1. 프로젝트 개요

### 목표
Remote.com(employ.remote.com)의 Time Tracking에서 **업무내용(notes)** 필드를 자동으로 채우는 도구.
- 시간은 이미 고정되어 있으므로 **notes만 입력**
- 데이터 소스: Git commit 로그, Slack 메시지 분석
- 추후 Jira 연동 확장 가능

### 자동화 흐름
```
[Git commits] + [Slack messages]
        ↓
   AI 요약 (한국어)
        ↓
   일별 업무내용 생성
        ↓
   Playwright 브라우저 자동화
        ↓
   Remote.com Time Tracking notes 입력
```

---

## 2. Remote.com API 조사

### 2.1 Public API (gateway.remote.com)
- **Base URL**: `https://gateway.remote.com/v1/`
- **인증**: Bearer token (`ra_live_xxx`)
- **문서**: https://developer.remote.com/

#### Timesheet API 엔드포인트 (Read-Only)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/v1/timesheets` | 타임시트 목록 조회 |
| GET | `/v1/timesheets/{id}` | 타임시트 상세 조회 |
| POST | `/v1/timesheets/{id}/approve` | 타임시트 승인 |
| POST | `/v1/timesheets/{id}/send-back` | 타임시트 반려 |

> **결론**: 타임시트 entries/notes 생성·수정 API가 **없음** → Playwright 브라우저 자동화 필수

### 2.2 Internal API (api.employ.remote.com)
프론트엔드가 사용하는 내부 API 엔드포인트 (네트워크 탭에서 발견):

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/v1/employee/timesheets?work_period[]=YYYY-MM-DD&work_period[]=YYYY-MM-DD` | 주간 타임시트 조회 |
| GET | `/api/v1/employee/employments/{id}/time-preferences` | 시간 설정 조회 |
| GET | `/api/v1/employee/employments/{id}/attendance-policies` | 출근 정책 조회 |
| GET | `/api/v1/work-calendars?start_date=...&end_date=...` | 근무 캘린더 조회 |
| POST | `/api/v1/employee/employments/{employment_id}/time-trackings` | 시간 기록 저장 (200 OK 확인) |
| PATCH | `/api/v1/employee/timesheets/{timesheet_id}` | 타임시트 업데이트 |

### 2.3 핵심 ID 값
| 항목 | 값 |
|------|-----|
| Employment ID | `ea3a110e-02c7-43cd-8277-43f6a4c85146` |
| 테스트 Timesheet ID (2/9-15) | `1b2708bd-a7d6-4f56-855b-c2a83b7be007` |

---

## 3. Remote.com UI 구조 분석

### 3.1 Time Tracking 페이지
- **URL**: `https://employ.remote.com/dashboard/time-tracking/`
- 주 단위로 타임시트 표시
- 좌우 화살표로 주간 이동

### 3.2 주간 타임시트 구조 (2/9-15, 2026 기준)
각 평일의 패턴:
```
월~금 (평일):
├── Regular Hours (오전): 09:00-12:00 (3h) — notes 필드 있음, 연필 아이콘
├── Break: 12:00-13:00 (1h) — notes 필드 있음, 연필 아이콘 없음
└── Regular Hours (오후): 13:00-18:00 (5h) — notes 필드 있음, 연필 아이콘

수/금 일부: Paid time off 항목 — 편집 불가
토/일: 0h, "Add hours" 버튼만 표시
```

### 3.3 Edit Modal 구조
```
Dialog: "Edit hours"
├── Day name, date, duration 표시
├── textbox "Clock in time hh:mm" (예: "09:00")
├── textbox "Clock out time hh:mm" (예: "12:00")
├── combobox "Type of work" (Regular hours, Break 등)
├── textbox [placeholder: "Add notes"] ← 🎯 타겟 필드
└── Buttons:
    ├── button "Delete"
    ├── button "Dismiss"
    └── button "Save hours" (test-id: modal-save-button)
```

### 3.4 검증된 자동화 워크플로우
```
1. employ.remote.com 로그인 (email + password)
2. /dashboard/time-tracking/ 이동
3. 올바른 주간으로 이동 (prev/next 버튼)
4. "Reopen timesheet" 클릭
5. 각 평일(월~금):
   a. "Edit time entry for XX:XX to XX:XX" 클릭 (Regular Hours 항목)
   b. "Edit hours" 다이얼로그 대기
   c. notes textbox 클리어 (placeholder: "Add notes")
   d. AI 생성 요약 입력
   e. "Save hours" 클릭 (test-id: modal-save-button)
   f. 다이얼로그 닫힘 대기
   g. 오후 항목도 필요시 반복
6. "Resubmit timesheet" 클릭
7. "Weekly hours" 다이얼로그에서 "Resubmit hours" 클릭
```

### 3.5 타임시트 상태 흐름
```
Draft → Submitted → Approved
                  ↗
         Reopened → (편집) → Resubmitted → Approved
```

---

## 4. Playwright 자동화 패턴 조사

### 4.1 인증 상태 유지 (storageState)
```typescript
// 최초 로그인 후 상태 저장
await context.storageState({ path: 'auth.json' });

// 이후 실행 시 재사용
const context = await browser.newContext({
  storageState: 'auth.json'
});
```
- cookies, localStorage, sessionStorage 모두 캡처
- 토큰 기반 SPA 인증에 적합
- 만료 시 재로그인 로직 필요

### 4.2 대안: Persistent Context
```typescript
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false
});
```
- 브라우저 프로필 전체 유지 (IndexedDB, service workers 포함)
- storageState로 부족할 때 사용

### 4.3 React SPA Modal 대기 패턴
```typescript
// ARIA role 기반 모달 대기
const modal = page.getByRole('dialog');
await modal.waitFor({ state: 'visible', timeout: 10000 });

// 모달 닫힘 대기
await modal.waitFor({ state: 'hidden', timeout: 10000 });

// React 상태 업데이트 대기
await page.waitForLoadState('networkidle');
```

### 4.4 React 폼 필드 입력
```typescript
// 기본 fill (대부분의 경우 동작)
await page.fill(selector, value);

// React controlled component 대응
await page.locator(selector).fill(value);
await page.locator(selector).press('Tab'); // blur 이벤트 트리거

// 최후 수단: 이벤트 직접 발생
await page.locator(selector).evaluate((el, val) => {
  el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, value);
```

### 4.5 에러 핸들링 & 재시도
```typescript
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 4.6 CLI 스크립트 구조
- Test runner가 아닌 **standalone 자동화 스크립트**로 구성
- 클래스 기반 구조 (TimesheetAutomation)
- `HEADLESS`, `SLOW_MO` 환경변수로 디버그 모드 지원

---

## 5. Slack API 조사

### 5.1 메시지 조회 엔드포인트

#### conversations.history (주력)
- 특정 채널/DM의 메시지 조회
- 최대 200개/요청, 커서 기반 페이지네이션
- `oldest`/`latest` 타임스탬프로 날짜 필터링
- Bot/User 토큰 모두 사용 가능

#### search.messages (대안)
- 전체 대화 검색 (쿼리 기반)
- `from:<@UserID> after:2024-02-01 before:2024-02-14` 문법
- **User 토큰만 사용 가능** (Bot 불가)
- 서버 사이드 필터링으로 효율적

#### users.conversations (보조)
- 사용자가 참여 중인 모든 대화 목록
- conversations.history 호출 전 채널 ID 수집용

### 5.2 인증

| 항목 | Bot Token (`xoxb-`) | User Token (`xoxp-`) |
|------|---------------------|----------------------|
| 자기 메시지 조회 | ✅ (봇이 채널에 있어야) | ✅ (모든 채널) |
| Private 채널 | 봇 멤버일 때만 | ✅ 모든 Private 채널 |
| search.messages | ❌ | ✅ |
| **추천** | ⚠️ 제한적 | ✅ **개인 자동화에 적합** |

#### 필요한 OAuth Scopes
```
channels:history    # 공개 채널 메시지 읽기
groups:history      # Private 채널 메시지 읽기
im:history          # DM 읽기
mpim:history        # 그룹 DM 읽기
search:read         # search.messages 사용 (선택, 권장)
```

### 5.3 Rate Limits
| Endpoint | Tier | Rate Limit |
|----------|------|------------|
| conversations.history | Tier 3 | 50+ req/min |
| search.messages | Tier 2 | 20+ req/min |
| users.conversations | Tier 2 | 20+ req/min |

> ⚠️ 2025년 5월부터 비-Marketplace 앱은 conversations.history 1 req/min 제한

### 5.4 Slack App 설정 절차
1. https://api.slack.com/apps → "Create New App" → "From scratch"
2. OAuth & Permissions에서 User Token Scopes 추가
3. Install to Workspace
4. User Token (`xoxp-...`) 복사

### 5.5 권장 접근법
```typescript
import { WebClient } from '@slack/web-api';

// search.messages로 날짜별 내 메시지 검색 (가장 효율적)
const query = `from:<@${myUserId}> after:${date} before:${nextDate}`;
const result = await client.search.messages({ query, count: 100, sort: 'timestamp' });
```

### 5.6 라이브러리
- **@slack/web-api**: 공식 Node.js SDK
- 내장 재시도 로직
- TypeScript 타입 지원

---

## 6. Git Commit 로그 수집

### 6.1 접근법
```bash
# 특정 날짜의 커밋 메시지 조회
git log --after="2026-02-10" --before="2026-02-11" --author="user@email.com" --pretty=format:"%h %s"

# 여러 리포지토리 대상
for repo in /path/to/repo1 /path/to/repo2; do
  git -C "$repo" log --after="..." --before="..." --author="..." --pretty=format:"%s"
done
```

### 6.2 Node.js에서의 구현
- `simple-git` 라이브러리 또는 `child_process.exec`로 git 명령 실행
- `--format` 옵션으로 필요한 필드만 추출
- 여러 리포지토리 경로를 설정에서 관리

---

## 7. 모노레포 구조 분석

### 7.1 parent 프로젝트 (game-builder)
```
game-builder/
├── package.json          # type: "module", pnpm workspaces
├── pnpm-workspace.yaml   # packages: ["packages/*"]
├── tsconfig.json         # strict, ES2020, bundler resolution
├── .eslintrc.json        # TypeScript recommended
├── bun.lock              # Bun 런타임
└── packages/
    ├── agents/           # AI 에이전트 로직
    ├── backend/          # Elysia + Bun API 서버
    ├── electron/         # Electron 데스크톱 앱 (Playwright 테스트 포함)
    ├── godot-manager/    # Godot 관리
    ├── shared/           # 공유 유틸리티
    └── web/              # 웹 프론트엔드
```

### 7.2 컨벤션
- **패키지 매니저**: pnpm (workspaces)
- **런타임**: Bun (`bun run` 스크립트)
- **패키지 명명**: kebab-case, `@game-builder/*` 스코프
- **TypeScript**: strict 모드, ES2020, bundler moduleResolution
- **구조**: 각 패키지에 `src/`, `package.json`, 선택적 `tsconfig.json`

### 7.3 고려사항
이 프로젝트(`업무일지 자동화`)는 게임 빌더와는 독립적인 도구이므로:
- `packages/` 안에 넣을지 vs 별도 루트 프로젝트로 관리할지 결정 필요
- 현재 위치: `/Users/jaesong/Documents/my/game-builder/업무일지 자동화/` (모노레포 루트 바로 아래)

---

## 8. 기술 스택 결정 (확정)

| 항목 | 결정 | 비고 |
|------|------|------|
| **프로젝트 구조** | 독립 프로젝트 | `업무일지 자동화/`에서 독자적 설정 |
| **런타임** | Bun | 기존 모노레포와 동일 |
| **GUI** | Electron 데스크톱 앱 | 설정, 미리보기, 실행 버튼 등 |
| **AI 프로바이더** | OpenRouter | 다중 모델 게이트웨이 (GPT-4o-mini, Claude Haiku 등 선택 가능) |
| **데이터 소스** | Git commit + Slack | 동시 구현, 추후 Jira 확장 |
| **CLI** | 심플 스크립트 | Electron GUI와 병행 |
| **설정 관리** | .env + JSON 설정 | 크레덴셜은 .env, 구조화 설정은 JSON |

### 8.1 Electron 앱 기능 (예상)
- 설정 화면: Remote.com 로그인, Slack 토큰, Git 리포 경로, OpenRouter API 키
- 주간 미리보기: 수집된 데이터 + AI 요약 결과 확인
- 실행 버튼: Playwright 자동화 실행
- 로그 뷰: 실행 상태 실시간 확인

---

## 9. 보안 고려사항

- Remote.com 로그인 자격증명 안전 저장
- Slack User Token (`xoxp-...`) 안전 저장
- AI API 키 안전 저장
- `.env` 파일 `.gitignore`에 추가
- auth.json (Playwright 세션) `.gitignore`에 추가

---

## 10. 참고 자료

### Remote.com
- Developer Docs: https://developer.remote.com/
- Timesheet API: https://developer.remote.com/docs/working-with-timesheets
- API Reference: https://developer.remote.com/reference/get_index_timesheet

### Slack
- API Methods: https://api.slack.com/methods
- conversations.history: https://api.slack.com/methods/conversations.history
- search.messages: https://api.slack.com/methods/search.messages
- OAuth Scopes: https://api.slack.com/scopes
- Node SDK: https://github.com/slackapi/node-slack-sdk

### Playwright
- Docs: https://playwright.dev/
- storageState: https://playwright.dev/docs/auth
- Locators: https://playwright.dev/docs/locators
