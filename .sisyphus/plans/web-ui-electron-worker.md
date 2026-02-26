# Web UI Control Plane + Electron Headless Worker (auto-remote)

## TL;DR

> **Quick Summary**: 웹(Vercel)을 단일 UI/연동 진입점으로 만들고, Electron은 **백그라운드(헤드리스) 워커**로서 Playwright로 Remote.com 타임시트만 자동 입력하도록 역할을 축소한다.
>
> **Deliverables**:
> - Vercel 웹: Slack/GitHub OAuth(HTTPS redirect) + 설정 UI + 실행/스케줄 제어 + 상태/로그 조회
> - Electron 워커: 웹에서 받은 설정/요약을 기반으로 Remote.com 자동 입력 + 진행상황 업로드
> - 비밀정보(토큰/패스워드) 저장 전략 정리 및 적용(팀 공통 vs 개인별)
>
> **Estimated Effort**: **Large**
> **Parallel Execution**: **YES — 4 waves**
> **Critical Path**: Storage/Auth(웹) → OAuth 저장(웹) → Agent 폴링/실행(Electron) → Summary API(웹) → Remote automation 통합(Electron)

---

## Context

### Original Request
- “팀 내에서 공유할 서비스”로 운영
- 웹(Vercel)에 UI를 통일하고, Electron은 Playwright 구동을 위해 백그라운드 워커 역할만 수행
- Slack 쪽이 안 되는 듯한데(redirect URI 문제), 올바른 방향으로 설계하고 싶음
- `OPENROUTER_API_KEY`는 공통 키(관리자가 설정)
- Remote.com email/password는 서비스 첫 화면에서 입력받아 동작(단, .env의 REMOTE_*는 개발자 E2E 테스트용)

### Key Findings (verified)
- **Slack OAuth redirect_uri는 HTTPS만 허용** → Slack 앱 설정에서 `autoremote://...`는 거부됨.
  - 근거: Slack 공식 OAuth 문서(Installing with OAuth)에서 redirect_uri must use HTTPS.
- GitHub는 loopback/device flow 등 유연하지만, **일관성을 위해 웹 OAuth 흐름을 유지**하는 편이 구현/운영이 단순.

### Current Code (reference points)
- 파이프라인(데스크톱 중심):
  - `src/core/orchestrator.ts` — 주간 수집→요약→Remote 자동화
  - `src/core/collectors/slack.ts` — Slack search API로 메시지 수집
  - `src/core/collectors/git.ts` — GitHub API로 커밋 수집
  - `src/core/ai/summarizer.ts` — OpenRouter 호출
  - `src/core/automation/remote.ts` + `src/core/automation/auth.ts` — Playwright로 Remote.com 입력
- Electron UI/스케줄:
  - `src/main/index.ts`, `src/main/ipc.ts`, `src/main/scheduler.ts`
- Web(OAuth/다운로드):
  - `web/src/index.ts`

### Metis Review (gaps to address)
- Web↔Electron 통신/저장소/권한(사용자 식별) 방식이 확정되어야 함
- Slack은 custom scheme redirect 불가 → 웹 콜백 기반으로만 설계
- 토큰/패스워드 저장 위치(서버 vs 로컬)와 로그/보안 가드레일을 명시해야 함
- (옵션) GitHub는 device flow 가능하지만, Slack과 일관성/운영 측면에서 web OAuth 유지가 합리적

---

## Work Objectives

### Core Objective
Vercel 웹을 **Control Plane(UI/연동/설정/실행 제어)** 로 만들고, Electron을 **Agent(헤드리스 워커)** 로 만들어 Remote.com 입력 자동화를 안정적으로 수행한다.

### Concrete Deliverables
- Web:
  - Slack/GitHub OAuth 결과를 **토큰 복사 UI가 아닌 서버 저장 + 연결 상태 UI**로 전환
  - Repo 선택/스케줄/언어/모델 등 설정 UI
  - “Run now” 트리거 및 진행 상황/로그 페이지
  - Weekly summary 생성 API(OpenRouter 호출은 서버에서, 공통 키 사용)
- Electron:
  - 백그라운드 실행(Tray 유지), 웹에서 설정/실행 신호를 받아 Playwright로 Remote.com 입력
  - 진행상황을 웹으로 업로드
  - Remote.com 세션(auth state) 안정화 및 자격증명 처리(보안 가드레일 포함)

### Definition of Done
- Slack OAuth redirect URL은 HTTPS만 사용하며, Slack 설정 페이지에서 오류 없이 저장됨
- 웹 UI에서 Slack/GitHub 연결 및 Repo 선택이 가능하고, 연결 상태가 “connected”로 표시됨
- 웹에서 Run now 클릭 → Electron 워커가 1분 내 작업을 시작하고 진행 로그가 웹에 표시됨
- Remote.com에 실제로 AM/PM Notes가 입력되고(timesheet resubmit 포함), 실패 시 웹에 원인 로그가 남음

### Must Have
- **No manual token copy/paste** (OAuth 후 토큰을 사용자에게 그대로 노출/복사하도록 요구하지 않기)
- Slack redirect_uri는 반드시 HTTPS
- 팀 공통 키(OpenRouter)는 서버 환경변수로만 관리(기본값)
- 진행상황/오류가 웹에서 확인 가능

### Must NOT Have (Guardrails)
- 개인별 토큰/패스워드를 `.env`에 상시 저장하는 구조(개발자 E2E 제외)
- Slack 앱 설정에 custom scheme redirect URI를 넣도록 요구
- 로그/에러 메시지에 access token / password / cookie가 그대로 노출
- Electron이 UI를 “필수”로 요구(설정은 웹에서 가능해야 함)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION for verification** — 모든 검증은 에이전트가 실행/증거를 남긴다.

### Test Decision
- **Infrastructure exists**: NO (repo에 테스트 러너/스크립트 부재)
- **Automated tests**: None (대신 QA 시나리오를 Playwright/CLI로 수행)

### QA Policy
- 각 TODO는 최소 2개 시나리오(성공/실패)를 포함
- 증거 파일 저장: `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Recommended Architecture (default)

**Control Plane(웹) + Agent(Electron) 모델**
- Web(Vercel): OAuth, 설정 저장, 요약 생성(OpenRouter 호출), 실행 트리거/상태
- Electron: 주기적으로 웹을 폴링하여 실행 요청을 감지하고 Remote.com Playwright 자동화를 수행

**저장소 기본값(권장)**
- Vercel 환경에서 사용하기 쉬운 KV/Redis(예: Vercel KV/Upstash)로 사용자/토큰/상태 저장
- 토큰은 서버에서 암호화하여 저장(키는 Vercel env로 관리)

**Agent Pairing/Auth (default)**
- Web은 Slack OAuth로 “사용자 식별(userId/teamId)”을 만든 뒤, **agent pairing code(예: 6자리)** 를 발급하고 KV에 TTL(10분)로 저장
- Electron은 첫 실행 시 pairing code를 사용자에게 보여주고(또는 web portal을 열어 입력 유도), agentId를 Web에 등록
- Web은 agentId에 대해 **agentToken(장기, 회전 가능)** 을 발급하고, Electron은 이를 **safeStorage로 로컬 저장**
- 이후 Agent 전용 API는 `Authorization: Bearer <agentToken>` 기반으로 인증

**Remote.com Credentials (default)**
- Remote.com email/password는 **서버에 장기 저장하지 않고**, 기본적으로 Electron 로컬에만 저장(safeStorage)
- Web UI에서 입력한 credential은 KV에 **1회성 transfer 레코드(TTL 10분)** 로 저장 → Agent가 pull → 성공 시 즉시 삭제(ack)
- (옵션) 운영 상 필요하면 “서버 암호화 저장” 모드를 추가할 수 있으나, 기본 계획에서는 금지(가드레일)

> 대안(옵션): GitHub만 device flow로 전환 가능하나, Slack과 이질적 흐름이 생겨 운영 복잡도↑ → 기본 계획에서는 web OAuth 유지.

### Parallel Execution Waves

Wave 1 (Foundation — storage/auth/contracts/agent skeleton)
├── Task 1: Web storage adapter + key schema (KV)
├── Task 2: Web crypto utilities (encrypt/decrypt + redaction)
├── Task 3: Web user/session identity model (Slack user 기반 최소 세션)
├── Task 4: Web Slack OAuth → token persistence + disconnect
├── Task 5: Web GitHub OAuth → token persistence + disconnect
├── Task 6: Electron agent HTTP client + poll loop skeleton
└── Task 7: Electron local secret storage abstraction (userData + safeStorage)

Wave 2 (Web UI + APIs + summary generation)
├── Task 8: Web UI skeleton (settings/dashboard routes)
├── Task 9: Web UI: Slack/GitHub 연결 상태 + 버튼
├── Task 10: Web UI/API: GitHub repo 선택/저장
├── Task 11: Web UI/API: Scheduler 설정/저장 + Run now trigger
├── Task 12: Web API: Weekly summary generation (GitHub+Slack+OpenRouter)
├── Task 13: Web API: Agent status/progress reporting + dashboard view
└── Task 14: Electron: fetch config + run job (remote automation) + report progress

Wave 3 (Hardening + migration + UX)
├── Task 15: Electron: Remote.com auth/session resilience (auth.json lifecycle)
├── Task 16: Electron: tray-only UX (no required window) + open web portal
├── Task 17: Migration: deprecate local OAuth+IPC UI path, keep minimal compatibility
├── Task 18: Security hardening: token revocation, workspace allowlist, log redaction
└── Task 19: Docs + env cleanup (web/electron) + onboarding guide

Wave 4 (Verification + packaging)
├── Task 20: E2E QA runbook automation (web + electron)
├── Task 21: Packaging verification (mac/win) + release smoke checks
└── Task 22: Reliability check (rate limits, retries, offline agent)

FINAL (Independent reviews — parallel)
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high + playwright)
└── F4: Scope Fidelity Check (deep)

---

## Dependency Matrix (abbreviated)

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1 | — | 4,5,10-13 | 1 |
| 2 | — | 4,5,12,18 | 1 |
| 3 | 1,2 | 8-11,13 | 1 |
| 4 | 1,2,3 | 9,12 | 1 |
| 5 | 1,2,3 | 10,12 | 1 |
| 6 | — | 14 | 1 |
| 7 | — | 14-16 | 1 |
| 12 | 1,2,4,5 | 14,20 | 2 |
| 14 | 6,7,12,13 | 15-16,20 | 2 |

---

## TODOs

> 모든 작업은 “구현 + 검증(QA 시나리오)”를 포함한다.

### 1) Web: storage adapter + key schema (KV)

- [ ] **Task 1. Web storage adapter + key schema (KV)**

  **What to do**:
  - `web/src/`에 KV/Redis 접근 래퍼(예: `storage.ts`) 추가: get/set/del + TTL 지원
  - 데이터 키 스키마 정의(예):
    - `user:{userId}`: Slack/GitHub profile + encrypted tokens + repos + prefs
    - `agent:{agentId}`: lastSeen, status
    - `run:{userId}`: run-now flag / requestedAt
    - `progress:{userId}`: latest progress snapshot

  **Must NOT do**:
  - 토큰/패스워드를 평문으로 저장

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: (none)

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)
  - Blocks: 3-5, 8-13

  **References**:
  - `web/src/index.ts` — 현재 web 엔트리; 여기에 저장소 레이어를 주입할 위치 파악
  - Vercel KV/Upstash 공식 문서(선정된 저장소 SDK)

  **Acceptance Criteria**:
  - [ ] `web` 프로젝트에서 storage 래퍼가 단위 실행 가능(간단한 dev 호출로 set/get 확인)

  **QA Scenarios**:
  - Scenario: KV set/get roundtrip
    - Tool: Bash
    - Steps: `cd web && bun run dev` 실행 후, 임시 엔드포인트(또는 REPL)로 set/get 수행
    - Evidence: `.sisyphus/evidence/task-1-kv-roundtrip.txt`
  - Scenario: TTL expiry
    - Tool: Bash
    - Steps: TTL 2s로 set → 3s 후 get이 empty
    - Evidence: `.sisyphus/evidence/task-1-kv-ttl.txt`

### 2) Web: crypto utilities (encrypt/decrypt + redaction)

- [ ] **Task 2. Web crypto utilities (encrypt/decrypt + redaction)**

  **What to do**:
  - 서버 env의 master key로 AES-GCM(또는 libsodium) 암호화 유틸 제공
  - 로그 출력 시 토큰/패스워드 자동 마스킹(redaction) 유틸 추가

  **Must NOT do**:
  - 토큰을 URL query string에 그대로 실어 보내기(필요 시 1회성 코드 사용)

  **Recommended Agent Profile**:
  - Category: `deep`
  - Skills: (none)

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)
  - Blocks: 4,5,12,18

  **References**:
  - `src/core/ai/summarizer.ts` — OpenRouter key 취급 참고(현재는 직접 Authorization 헤더 사용)
  - Node crypto docs (AES-GCM)

  **Acceptance Criteria**:
  - [ ] encrypt→decrypt roundtrip이 항상 원문 일치
  - [ ] redaction 유틸이 토큰 패턴(xoxp-/gho_/sk-or- 등)을 마스킹

  **QA Scenarios**:
  - Scenario: encrypt/decrypt roundtrip
    - Tool: Bash
    - Steps: dev 서버에서 테스트 엔드포인트 호출(또는 unit 실행)
    - Evidence: `.sisyphus/evidence/task-2-crypto-roundtrip.txt`
  - Scenario: logs are redacted
    - Tool: Bash
    - Steps: 의도적으로 토큰 문자열을 로그에 넣는 케이스 실행 → 출력에서 마스킹 확인
    - Evidence: `.sisyphus/evidence/task-2-redaction.txt`

### 3) Web: user/session identity model (Slack user 기반 최소 세션)

- [ ] **Task 3. Web user/session identity model (Slack user 기반 최소 세션)**

  **What to do**:
  - Slack OAuth 성공 시 userId/teamId/userName을 user record로 저장
  - 웹 UI 접근 시 최소한 “현재 사용자” 컨텍스트를 식별(쿠키 세션/JWT)
  - 팀 내부용 가드레일: 특정 Slack teamId allowlist(ENV) 옵션
  - **Agent pairing(디바이스 연결) 최소 모델** 추가:
    - Agent가 생성한 `pairingCode`(TTL 10분)를 서버(KV)에 저장
    - Web(로그인된 사용자)이 `pairingCode`를 “claim”하여 agentId를 userId에 바인딩
    - claim 완료 시 **agentToken 발급**(서버 저장은 hash로) → Agent가 이후 API 인증에 사용

  **Must NOT do**:
  - 인증 없이 누구나 토큰/설정에 접근 가능

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: (none)

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)
  - Blocks: 8-13

  **References**:
  - `web/src/index.ts` — cookie state 처리/콜백 페이지 패턴

  **Acceptance Criteria**:
  - [ ] Slack OAuth 완료 후 웹이 사용자 컨텍스트를 인식(대시보드에 user 표시)
  - [ ] allowlist 설정 시 다른 workspace 유저는 차단됨
  - [ ] pairingCode claim 후 agentToken이 발급되고, 이후 agent 인증이 동작

  **QA Scenarios**:
  - Scenario: session established after Slack OAuth
    - Tool: Playwright
    - Steps: OAuth 콜백을 모킹(또는 실제) → dashboard 접근 시 user 표시
    - Evidence: `.sisyphus/evidence/task-3-session.png`
  - Scenario: pairing code claim binds agent
    - Tool: Bash + Playwright
    - Steps:
      1. (Agent 시뮬레이션) `POST /api/agent/pairing/start` → pairingCode 발급
      2. (Web) 대시보드에서 pairingCode 입력/claim
      3. (Agent) `GET /api/agent/pairing/status?agentId=...`로 agentToken 수령
      4. agentToken으로 보호된 endpoint 호출이 200
    - Evidence: `.sisyphus/evidence/task-3-pairing.txt`
  - Scenario: deny non-allowlisted team
    - Tool: Bash
    - Steps: teamId 불일치 payload로 callback 호출 → 403/에러 페이지
    - Evidence: `.sisyphus/evidence/task-3-allowlist.txt`

### 4) Web: Slack OAuth → token persistence + disconnect

- [ ] **Task 4. Web Slack OAuth persistence + disconnect**

  **What to do**:
  - `web/src/index.ts`의 `/api/slack/callback`에서 토큰을 화면에 노출하는 대신:
    - token exchange 후 결과를 user record에 암호화 저장
    - 연결 성공 페이지는 “connected”만 표시(토큰 값 직접 노출 X)
  - disconnect endpoint 추가(토큰 삭제)

  **Must NOT do**:
  - `SLACK_USER_TOKEN` 값을 HTML에 그대로 렌더링

  **Recommended Agent Profile**:
  - Category: `unspecified-high`

  **Parallelization**:
  - Can Run In Parallel: YES (Wave 1)
  - Blocked By: 1,2,3

  **References**:
  - `web/src/index.ts` — `/api/slack/authorize`, `/api/slack/callback` 구현
  - Slack OAuth docs: Installing with OAuth (redirect_uri must be https)

  **Acceptance Criteria**:
  - [ ] Slack OAuth 완료 페이지에서 토큰 문자열이 노출되지 않음
  - [ ] user record에 Slack token/userId/userName 저장됨

  **QA Scenarios**:
  - Scenario: Slack connect success does not reveal token
    - Tool: Playwright
    - Steps: OAuth 성공 플로우 완료 → 페이지 소스에 `xoxp-`가 없는지 확인
    - Evidence: `.sisyphus/evidence/task-4-no-token-leak.txt`
  - Scenario: Slack disconnect removes token
    - Tool: Bash
    - Steps: disconnect 호출 → 이후 상태 API에서 disconnected
    - Evidence: `.sisyphus/evidence/task-4-disconnect.txt`

### 5) Web: GitHub OAuth → token persistence + disconnect

- [ ] **Task 5. Web GitHub OAuth persistence + disconnect**

  **What to do**:
  - `/api/github/callback`에서 access token을 user record에 암호화 저장
  - username 저장, disconnect 시 토큰/username 제거

  **References**:
  - `web/src/index.ts` — GitHub OAuth endpoints
  - GitHub docs: Authorizing OAuth apps (PKCE 옵션 포함)

  **Acceptance Criteria**:
  - [ ] GitHub OAuth 완료 후 token은 서버에 암호화 저장되고(username 포함), UI/HTML에 토큰이 노출되지 않음
  - [ ] disconnect 후 GitHub 연결 상태가 disconnected로 표시되고, 서버 저장 token/username이 제거됨

  **QA Scenarios**:
  - Scenario: GitHub connect stores username and hides token
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-5-github-connect.txt`
  - Scenario: disconnect clears config
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-5-github-disconnect.txt`

### 6) Electron: agent HTTP client + poll loop skeleton

- [ ] **Task 6. Electron agent HTTP client + poll loop skeleton**

  **What to do**:
  - Electron main에 web API client 모듈 추가
  - **First-run pairing**:
    - agentId 생성 → `POST /api/agent/pairing/start`로 pairingCode 등록/수령
    - pairingCode를 사용자에게 노출(Tray 메뉴/알림/로그)
    - `GET /api/agent/pairing/status` 폴링으로 claim 여부 확인 → agentToken 수령
    - agentToken은 Task 7의 safeStorage로 저장
  - 30~60초 간격 폴링:
    - config fetch
    - run-now flag fetch
    - agent heartbeat(lastSeen) 업로드
    - (보호된 API는 agentToken으로 Authorization 헤더 포함)

  **Must NOT do**:
  - 토큰/패스워드를 콘솔에 출력

  **References**:
  - `src/main/scheduler.ts` — 현재 tick 기반 폴링/스케줄 패턴
  - `src/main/index.ts` — tray/lifecycle

  **Acceptance Criteria**:
  - [ ] 최초 실행 시 pairingCode 생성/등록 및 claim 후 agentToken 저장 완료
  - [ ] agentToken 보유 시 heartbeat/config/commands 호출이 정상 동작(401 없음)
  - [ ] web 장애 시 크래시 없이 재시도(backoff)하며 로컬에 오류만 기록

  **QA Scenarios**:
  - Scenario: first-run pairing completes and agentToken stored
    - Tool: Bash + Playwright
    - Steps:
      1. Electron 실행 → pairingCode 확인
      2. Web 포털에서 pairingCode claim
      3. Electron이 agentToken을 수령하고 보호된 API 호출 성공
    - Evidence: `.sisyphus/evidence/task-6-pairing.txt`
  - Scenario: offline web handling
    - Tool: Bash
    - Steps: web URL 잘못 설정 → 에러가 크래시 없이 backoff/retry
    - Evidence: `.sisyphus/evidence/task-6-offline.txt`

### 7) Electron: local secret storage abstraction (userData + safeStorage)

- [ ] **Task 7. Electron local secret storage abstraction**

  **What to do**:
  - `app.getPath('userData')` 하위에 **로컬 상태/시크릿 저장 레이어** 구축
    - Remote.com auth state(`auth.json` 등)
    - Remote.com email/password (시크릿)
    - Web agentToken (시크릿)
  - 가능한 경우 Electron `safeStorage`로 OS keychain 기반 암호화 사용
  - safeStorage가 불가한 플랫폼/상황에서는 파일 저장 시 **추가 암호화**(Task 2와 호환되는 방식) 적용
  - 시크릿은 절대 `config.json`/로그에 평문으로 기록하지 않도록 가드

  **References**:
  - `src/core/config.ts:getAuthStatePath()` — 현재 auth.json 위치
  - Electron docs: safeStorage
  - `src/core/automation/auth.ts` — email/password 사용 지점

  **Acceptance Criteria**:
  - [ ] auth state 및 agentToken/remote creds가 userData 하위로 이동
  - [ ] remote password / agentToken 평문이 파일/로그에 남지 않음

  **QA Scenarios**:
  - Scenario: auth state saved under userData
    - Tool: Bash
    - Steps: 1회 실행 후 userData 경로에 auth state 생성 확인
    - Evidence: `.sisyphus/evidence/task-7-userdata-path.txt`
  - Scenario: secrets not readable in plaintext file
    - Tool: Bash
    - Steps: Remote credential 저장 후 userData 내 파일에서 password/token 평문이 없는지 확인
    - Evidence: `.sisyphus/evidence/task-7-no-plaintext.txt`

### 8) Web UI skeleton (settings/dashboard routes)

- [ ] **Task 8. Web UI skeleton (settings/dashboard routes)**

  **What to do**:
  - `web/src/index.ts`에 설정/대시보드 HTML 라우트 추가(또는 UI 프레임워크 도입 결정)
  - **기존 Electron UI(3-step)를 웹으로 이식**:
    - Step 1: Remote.com 설정(Email/Password/EmploymentId/Timezone)
    - Step 2: Integrations(Slack/GitHub)
    - Step 3: Dashboard(스케줄, Run now, 상태/로그)
  - Remote.com email/password는 서버에 장기 저장하지 않고(가드레일),
    - 서버는 **1회성 transfer 레코드(TTL)** 로만 저장 → Agent가 pull 후 즉시 삭제(ack)
    - 예: `POST /api/remote/credentials` (세션 인증 필요) → transfer 생성
  - 공통 레이아웃/네비게이션(설정/상태/다운로드)

  **Recommended Agent Profile**:
  - Category: `visual-engineering`
  - Skills: `frontend-ui-ux`

  **References**:
  - `web/src/index.ts:landingPage()/successPage()` — 기존 HTML 렌더링 스타일
  - `src/renderer/src/App.tsx` — 현재 설정 UX(단계: remote → integrations → dashboard)

  **Acceptance Criteria**:
  - [ ] Remote → Integrations → Dashboard 흐름이 웹에서 재현됨
  - [ ] Remote email/password는 서버에 장기 저장되지 않고 transfer 레코드(TTL)로만 저장됨

  **QA Scenarios**:
  - Scenario: dashboard loads and shows connection states
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-8-dashboard.png`
  - Scenario: remote setup step validates inputs
    - Tool: Playwright
    - Steps: email/password 비어있을 때 Continue 비활성화 또는 에러 표시
    - Evidence: `.sisyphus/evidence/task-8-remote-validate.png`
  - Scenario: unauthenticated user redirected to connect
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-8-auth-redirect.png`

### 9) Web UI: Slack/GitHub connect 상태 + 버튼

- [ ] **Task 9. Web UI: Slack/GitHub 연결 상태 + connect/disconnect 버튼**

  **References**:
  - `src/renderer/src/App.tsx:IntegrationsStep` — connect/disconnect UX 참고

  **Acceptance Criteria**:
  - [ ] Slack/GitHub 각각 disconnected/connected 상태가 UI에서 즉시 구분됨
  - [ ] disconnect 시 서버 저장 token이 제거되고 상태가 갱신됨

  **QA Scenarios**:
  - Scenario: Slack disconnected → connect 버튼 노출
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-9-slack-ui.png`
  - Scenario: disconnect 클릭 → 상태가 disconnected로 전환
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-9-disconnect.png`

### 10) Web UI/API: GitHub repo 선택/저장

- [ ] **Task 10. Web UI/API: GitHub repo 선택/저장**

  **What to do**:
  - GitHub token 기반 `user/repos` 호출을 서버에서 수행하고 리스트 제공
  - 선택 repo 목록을 user record에 저장

  **References**:
  - `src/main/ipc.ts: github:repos` — 기존 repo fetching 로직
  - `src/core/collectors/git.ts` — repos/username 기반 commit 수집

  **Acceptance Criteria**:
  - [ ] GitHub 연결된 사용자에 대해 repo 목록이 1회 이상 로드됨
  - [ ] 선택 repo가 서버에 저장되고 이후 summary 생성에 반영됨

  **QA Scenarios**:
  - Scenario: repo list loads (authenticated)
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-10-repo-list.png`
  - Scenario: save repos persists
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-10-repo-save.txt`

### 11) Web UI/API: Scheduler 설정/저장 + Run now trigger

- [ ] **Task 11. Web UI/API: Scheduler + Run now**

  **References**:
  - `src/main/scheduler.ts` — enabled/time/skipWeekends 모델

  **Acceptance Criteria**:
  - [ ] 스케줄(enabled/time/skipWeekends)이 서버에 저장되고 agent config endpoint로 제공됨
  - [ ] Run now 클릭 시 agent commands 플래그가 설정되고, 실행 후 자동 해제됨(중복 실행 방지)

  **QA Scenarios**:
  - Scenario: update schedule reflects in API
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-11-schedule.png`
  - Scenario: run-now sets flag
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-11-run-flag.txt`

### 12) Web API: Weekly summary generation (GitHub+Slack+OpenRouter)

- [ ] **Task 12. Web API: Weekly summary generation**

  **What to do**:
  - `src/core/collectors/*`와 `src/core/ai/*` 로직을 웹에서 재사용/이식
  - OpenRouter 호출은 **서버 env `OPENROUTER_API_KEY`**를 사용
  - 결과는 `WeeklySummary` 형태로 반환(기존 `src/core/types.ts` 참고)
  - Agent/사용자 인증이 필요한 endpoint로 제공(예: `POST /api/summary/week`)

  **Must NOT do**:
  - OpenRouter 키를 클라이언트로 내려보내기

  **References**:
  - `src/core/orchestrator.ts` — 주간 데이터/요약 생성 흐름
  - `src/core/collectors/slack.ts` — Slack 메시지 수집
  - `src/core/collectors/git.ts` — GitHub 커밋 수집
  - `src/core/ai/summarizer.ts` — OpenRouter 호출 방식

  **Acceptance Criteria**:
  - [ ] 인증된 요청에 대해 `WeeklySummary`(5 workdays) JSON이 반환됨
  - [ ] OpenRouter 키가 서버 env에서만 사용되고, 응답/로그에 노출되지 않음
  - [ ] 인증 누락/실패 시 401

  **QA Scenarios**:
  - Scenario: weekly summary endpoint returns 5 workdays
    - Tool: Bash (curl)
    - Evidence: `.sisyphus/evidence/task-12-weekly-summary.json`
  - Scenario: missing/invalid auth returns 401
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-12-unauth.txt`
  - Scenario: missing tokens returns 4xx with clear error
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-12-missing-token.txt`

### 13) Web API: Agent status/progress reporting + dashboard view

- [ ] **Task 13. Web API: Agent API surface (config/commands/secrets/progress) + UI**

  **What to do**:
  - Agent 인증(Authorization: Bearer agentToken)이 필요한 API 세트 구현:
    - `GET /api/agent/config` — 스케줄/선호언어/모델 등(민감정보 제외)
    - `GET /api/agent/commands` — runNow 플래그 + 대상 weekStart 등
    - `GET /api/agent/secrets/pending` — 1회성 transfer(Remote.com creds) pull
    - `POST /api/agent/secrets/ack` — transfer 성공 처리 및 서버 삭제
    - `POST /api/agent/heartbeat` — lastSeen 갱신
    - `POST /api/agent/progress` — AutomationProgress 업로드
  - User-facing UI:
    - dashboard에서 agent lastSeen/현재 상태/최근 로그 표시
    - run-now 클릭 시 commands 플래그 설정

  **Must NOT do**:
  - agentToken 없이 민감한 데이터를 반환

  **References**:
  - `src/core/types.ts:AutomationProgress/LogEntry` — progress payload shape
  - `src/main/scheduler.ts` — scheduler 모델(시간/주말 스킵)
  - `web/src/index.ts` — 기존 라우팅/HTML 렌더링 패턴

  **Acceptance Criteria**:
  - [ ] agentToken 미제공 시 `/api/agent/*`는 401
  - [ ] progress 업로드 후 dashboard에 로그가 표시됨
  - [ ] secrets pull 후 ack 시 서버에서 pending secrets가 제거됨

  **QA Scenarios**:
  - Scenario: unauthorized agent call rejected
    - Tool: Bash
    - Steps: Authorization 없이 `/api/agent/config` 호출 → 401
    - Evidence: `.sisyphus/evidence/task-13-unauth.txt`
  - Scenario: agent posts progress → web dashboard shows logs
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-13-progress.png`
  - Scenario: agent pulls pending remote creds and acks
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-13-secrets-ack.txt`
  - Scenario: token redaction in UI/logs
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-13-redaction.png`

### 14) Electron: fetch config + run job (remote automation) + report progress

- [ ] **Task 14. Electron job runner (summary → Remote.com automation)**

  **What to do**:
  - web에서 받은 `WeeklySummary`를 `src/core/automation/remote.ts:automateTimesheet()`에 전달
  - 실행 전 Remote.com credential이 로컬에 존재하는지 확인(없으면 즉시 에러 상태/가이드)
  - 진행상황을 web progress API로 업로드
  - 실패 시 error 메시지를 progress에 포함

  **References**:
  - `src/core/automation/remote.ts` — 입력 자동화
  - `src/core/automation/auth.ts` — 세션 유효성/로그인
  - `src/main/scheduler.ts` — 기존 executeFullPipeline 호출

  **Acceptance Criteria**:
  - [ ] run-now 플래그 감지 후 60초 내 실행을 시작하고 progress가 서버에 업로드됨
  - [ ] Remote.com 입력 성공 시 status=done 및 요약 로그가 dashboard에 표시됨
  - [ ] Remote credential 미설정/로그인 실패 시 status=error + 원인 메시지 업로드

  **QA Scenarios**:
  - Scenario: run-now triggers automation
    - Tool: Bash + Playwright(웹)
    - Steps: 웹에서 run-now → electron이 summary fetch → remote automation 실행
    - Evidence: `.sisyphus/evidence/task-14-run-now.txt`
  - Scenario: remote.com login failure propagates
    - Tool: Bash
    - Steps: 잘못된 password 설정 → progress status=error + 원인 표시
    - Evidence: `.sisyphus/evidence/task-14-remote-login-fail.txt`

### 15) Electron: Remote.com auth/session resilience (auth.json lifecycle)

- [ ] **Task 15. Electron Remote.com session resilience**

  **What to do**:
  - auth state validation 실패 시 재로그인 전략(backoff, clear state)
  - headless 기본 유지, 필요 시 headful 전환 옵션(관리자/디버깅)

  **References**:
  - `src/core/automation/auth.ts:validateExistingSession/performFreshLogin`

  **Acceptance Criteria**:
  - [ ] 기존 auth state가 만료/무효일 때 자동으로 재로그인 시도
  - [ ] 재로그인 실패 시 에러가 progress로 전달되고 크래시 없이 종료

  **QA Scenarios**:
  - Scenario: expired auth state triggers fresh login
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-15-relogin.txt`
  - Scenario: auth state corruption handled
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-15-corrupt-state.txt`

### 16) Electron: tray-only UX + open web portal

- [ ] **Task 16. Electron tray-only UX**

  **What to do**:
  - 기본은 창 없이(tray만) 실행
  - tray 메뉴에 “Open Web Portal”, “Run now”, “Quit” 제공

  **References**:
  - `src/main/index.ts:createTray()`

  **Acceptance Criteria**:
  - [ ] 앱 실행 시 기본 창이 뜨지 않아도(tray-only) 워커가 동작
  - [ ] tray 메뉴에서 web portal 열기/종료가 가능

  **QA Scenarios**:
  - Scenario: app starts hidden, tray available
    - Tool: interactive_bash (tmux)
    - Evidence: `.sisyphus/evidence/task-16-tray.txt`
  - Scenario: open portal opens default browser to Vercel URL
    - Tool: interactive_bash
    - Evidence: `.sisyphus/evidence/task-16-open-portal.txt`

### 17) Migration: deprecate local OAuth+IPC UI path, keep minimal compatibility

- [ ] **Task 17. Migration: remove/deprecate local UI OAuth paths**

  **What to do**:
  - `src/main/oauth.ts`(localhost callback) 및 renderer 기반 설정 플로우를 단계적으로 비활성화
  - 기존 사용자 로컬 설정이 남아있다면 web 기반으로 마이그레이션 안내

  **References**:
  - `src/main/ipc.ts` — 기존 config/save/oauth handlers
  - `src/renderer/src/App.tsx` — 기존 3-step UI
  - `web/src/index.ts` — 새 control plane 진입점

  **Acceptance Criteria**:
  - [ ] 기존 localhost OAuth 경로(`src/main/oauth.ts`)가 워커 모드에서 더 이상 필요하지 않음(또는 비활성)
  - [ ] 기존 사용자 설정이 존재할 때도 앱이 깨지지 않고 마이그레이션 안내를 제공
  - [ ] `npm run build` 및 `npm run dist`가 통과

  **QA Scenarios**:
  - Scenario: old app config present → app still runs, shows migration notice
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-17-migration.txt`
  - Scenario: no renderer build required for worker mode
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-17-build.txt`

### 18) Security hardening: token revocation, allowlist, log redaction

- [ ] **Task 18. Security hardening**

  **What to do**:
  - Slack/GitHub disconnect는 실제 토큰 폐기/삭제
  - Slack API rate limit 처리/재시도 정책 문서화
  - progress/log payload에서 민감정보 필터 적용

  **References**:
  - `src/core/collectors/slack.ts` — rate limit 케이스 처리

  **Acceptance Criteria**:
  - [ ] disconnect 시 서버 저장 토큰이 삭제되고 summary/collector 호출이 인증 실패로 처리됨
  - [ ] 로그/진행 payload에 토큰/패스워드/쿠키가 포함되지 않음
  - [ ] (옵션) Slack workspace allowlist가 동작

  **QA Scenarios**:
  - Scenario: rate limit returns partial results but still generates summary
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-18-rate-limit.txt`
  - Scenario: progress payload never includes tokens
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-18-no-token.txt`

### 19) Docs + env cleanup + onboarding

- [ ] **Task 19. Docs + env cleanup**

  **What to do**:
  - 웹/워커 각각 필요한 ENV 목록 정리 및 `.env.example` 업데이트
  - Slack Redirect URL은 https만 가능하다는 점을 README/설정 가이드에 명시
  - 팀 온보딩 문서(1) 웹에서 Slack/GitHub 연결 (2) Electron 설치 (3) Run now 확인

  **References**:
  - `.env.example`, `web/` 배포 설정
  - Slack OAuth docs (redirect_uri must be https)

  **Acceptance Criteria**:
  - [ ] web/electron 각각 필요한 ENV가 명확히 구분되어 문서화됨
  - [ ] Slack Redirect URL(HTTPS 필수) 설정 가이드가 포함됨
  - [ ] 팀원이 문서만 보고 1시간 내 온보딩 가능(연동→설치→Run now)

  **QA Scenarios**:
  - Scenario: docs checklist can be followed end-to-end
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-19-onboarding.png`
  - Scenario: env example matches runtime needs
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-19-env.txt`

### 20) E2E QA runbook automation (web + electron)

- [ ] **Task 20. E2E QA runbook**

  **What to do**:
  - 최소 시나리오를 스크립트/절차로 고정 (OAuth 연결/Repo 선택/Run now/Progress/Remote 입력)

  **Acceptance Criteria**:
  - [ ] Happy-path와 실패 케이스(run-now, missing slack 등)가 문서/스크립트로 고정됨
  - [ ] 실행 결과 증거가 `.sisyphus/evidence/task-20-*/`에 남음

  **QA Scenarios**:
  - Scenario: happy-path full run
    - Tool: Playwright + Bash
    - Evidence: `.sisyphus/evidence/task-20-happy-path/`
  - Scenario: Slack disconnected → summary generation fails gracefully
    - Tool: Playwright
    - Evidence: `.sisyphus/evidence/task-20-missing-slack.png`

### 21) Packaging verification (mac/win)

- [ ] **Task 21. Packaging verification**

  **What to do**:
  - `npm run dist`로 패키징 후 설치/실행/트레이 동작 확인
  - 업데이트/릴리즈 다운로드 페이지(`web/src/index.ts`) 정상 동작 확인

  **References**:
  - `electron-builder.yml`
  - `web/src/index.ts:/download` routes

  **Acceptance Criteria**:
  - [ ] macOS/Windows에서 설치 후 tray-only 실행 및 포털 열기 동작
  - [ ] 다운로드 페이지가 릴리즈/에러 케이스 모두 정상 동작

  **QA Scenarios**:
  - Scenario: packaged app runs headless and reports status
    - Tool: interactive_bash
    - Evidence: `.sisyphus/evidence/task-21-packaged.txt`
  - Scenario: download page fetches latest release (with/without token)
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-21-download.txt`

### 22) Reliability check (offline agent / retries)

- [ ] **Task 22. Reliability check**

  **Acceptance Criteria**:
  - [ ] web/API 장애 시 agent가 backoff로 복구하며 크래시 없음
  - [ ] OpenRouter 오류 시 요약 생성이 명확한 에러/폴백으로 처리됨

  **QA Scenarios**:
  - Scenario: web downtime → agent retries with backoff
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-22-backoff.txt`
  - Scenario: OpenRouter error → summary fallback
    - Tool: Bash
    - Evidence: `.sisyphus/evidence/task-22-openrouter-fail.txt`

---

## Final Verification Wave (MANDATORY)

- [ ] **F1. Plan Compliance Audit** — `oracle`
- [ ] **F2. Code Quality Review** — `unspecified-high`
- [ ] **F3. Real Manual QA** — `unspecified-high` (+ `playwright`)
- [ ] **F4. Scope Fidelity Check** — `deep`

---

## Success Criteria

### Verification Commands (examples)
```bash
# web
cd web && bun run dev

# electron
npm run dev
npm run build
npm run dist
```

### Final Checklist
- [ ] Slack redirect URL 설정이 HTTPS로만 구성됨(스크린샷의 오류가 재발하지 않음)
- [ ] 웹에서 Slack/GitHub 연결 + Repo 선택 + 스케줄 저장 가능
- [ ] Electron이 백그라운드에서 Run now를 실행하고 Remote.com 입력 완료
- [ ] 웹에서 진행/오류 로그를 확인 가능
- [ ] 토큰/패스워드가 UI/로그/저장소에 평문 노출되지 않음
