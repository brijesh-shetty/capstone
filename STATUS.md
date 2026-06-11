# STATUS.md — Repo Audit (Phase 0)

_Last updated: 2026-06-10. Audit only — no code changes were made._

## Current Stack

| Layer | What's actually here |
|---|---|
| Backend | Node 22 + TypeScript, Express 4, `ts-node-dev` for dev |
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind 3 (no react-router — state-based page switching in `client/src/App.tsx` with sessionStorage persistence) |
| ORM / DB | Prisma 7 (`@prisma/client 7.8`, `prisma.config.ts` supplies `DATABASE_URL`), **PostgreSQL** (native install, **PostgreSQL 18** on `127.0.0.1:5432`, database `learndb`) |
| Cache / Jobs | Redis via `ioredis`, **BullMQ already in use** (`server/src/jobs/masteryJob.ts` — `mastery` queue + worker) |
| LLM | **Groq SDK (llama-3.3-70b-versatile)** is the active provider (hints, explanations, question/tutorial generation). `@anthropic-ai/sdk` and `@google/generative-ai` are installed as deps; `.env` has `GROQ_API_KEY` + `GEMINI_API_KEY` but **no `ANTHROPIC_API_KEY`** |
| Auth | JWT (`jsonwebtoken` + bcryptjs), `Role` enum already has `STUDENT / COLLEGE_STUDENT / EDUCATOR / ADMIN` — but there is no admin UI and almost no role gating (only `/tests/generate` checks `COLLEGE_STUDENT`) |
| Package manager | npm, separate lockfiles per workspace (`client/`, `server/` — **not** an npm workspaces monorepo) |
| Tests | Jest + ts-jest configured (`server/jest.config.js`) but **zero test files exist** |

## Run Commands

```bash
# Server (port 4000)
cd server && npm run dev          # ts-node-dev src/index.ts

# Client (port 5173)
cd client && npm run dev          # vite

# DB
cd server
npx prisma migrate dev            # migrations (3 applied so far)
npx prisma db seed                # runs prisma/seed.ts (via prisma.config.ts)

# Redis must be running on localhost:6379
```

Demo login: `student@example.com` / `password`.

## Database — Engine & Where Data Lives

- **Already PostgreSQL** — native Windows install (PostgreSQL 18), DB `learndb` at `127.0.0.1:5432`. There is no SQLite/Supabase legacy to migrate.
- **pgAdmin 4 is already installed** — bundled with PostgreSQL 18 at `C:\Program Files\PostgreSQL\18\pgAdmin 4`. It just needs the server registered.
- **Docker is NOT installed** (`docker` not on PATH). Phase 1's docker-compose path and Phase 3's self-hosted Judge0 both need a decision (see Blockers).
- Current row counts (live query, 2026-06-10): 3 users, 8 domains, 35 topics, **0 game sessions, 0 tests, 0 interview rows** (see "Data gaps" below).

### Existing Prisma models (`server/prisma/schema.prisma`)
`User`, `Topic` (taxonomy only — questions are LLM-generated, never stored), `GameSession`, `QuestionAttempt` (stores question *hash* only), `MasteryScore`, `Test` (a **result record**, not a test definition), `TestQuestion` (result row, hash only), `StudyPlan`, `Domain`, `UserDomainProgress`, `Achievement`, `UserAchievement`, plus the Interview Prep set: `InterviewCategory`, `InterviewTopic`, `InterviewQuestion`, `InterviewTheory`, `UserInterviewProgress`.

⚠️ **Naming collisions with the build plan**: the plan's `Topic`, `Test`, `Question` clash with existing models that mean different things. Phase 1 schema must use distinct names (e.g. `AssessmentTopic`/`AssessmentTest`, or reuse `Interview*` tables where they genuinely overlap).

## What Already Exists for Tests / Quizzes / Diagnostics (extend, don't duplicate)

1. **Legacy LLM-generated test flow** — `server/src/routes/tests.ts` + `testService.ts` + `questionService.ts`:
   - Generates aptitude/logical/verbal MCQs via Groq, stashes the answer key in Redis (TTL = timeLimit + 30 min), grades **server-side**, persists `Test`/`TestQuestion` results, queues mastery recalculation, has `/history` and `/:testId/analysis` (per-subtopic accuracy, weak/strong topic lists).
   - ⚠️ **Not registered** in `server/src/index.ts` — `/tests` and `/mastery` routes are currently dead code.
   - Matching client pages `TestPortal.tsx`, `TestSetup.tsx`, `TestExecution.tsx`, `TestAnalysis.tsx`, `StudyPlan.tsx`, `TopicExplainer.tsx` exist but are **not imported in `App.tsx`** — orphaned.
   - This is the closest ancestor of Phase 4 (runner) + Phase 6 (reports): server-authoritative grading, weak-topic analysis, and a remediation/study-plan concept already exist in primitive form.
2. **Interview Prep module (Session 3)** — schema, `interviewService.ts`, `/interview` routes (registered), and 5 client pages (Hub/Category/Theory/Quiz/GameSelect) are all wired up. Grading is server-side against `correctIndex`. Groq generates hints/explanations with Redis caching.
3. **Weakness detection** — `weaknessDetector.ts` + `MasteryScore` + BullMQ recalc job.
4. **Game arcade** — 7+ game engines, XP/levels/achievements/streaks/leaderboard. Untouched by this build plan (Phase 2 of the old CLAUDE.md treats them as future enhancements).

## Data Gaps (critical)

- **Interview tables are EMPTY on this machine.** `seed.ts` reads the question/theory JSONs from hard-coded paths on a *different computer* (`c:/Users/Lenovo/Downloads/aptitude_book_470_solved (1).json`, `topic_theory_notes.json`) and silently skips when missing. The files are **not** in the repo (`server/prisma/data/` doesn't exist).
- ~~The JV Global Services handout PDF was not found~~ **Resolved 2026-06-10**: user provided `B2_course materials_60hr.pdf` (98 pages, JV Global Services student handout); copied to `server/prisma/data/jv_handout.pdf` (gitignored — copyrighted material). Text extracts cleanly with pypdf.

## Security Flags (fix early)

- 🔴 `server/serviceAccountKey.json` (Firebase admin private key) is **committed to git**. Should be removed from tracking, rotated, and gitignored.
- `.env` files are correctly gitignored. `FIREBASE_DATABASE_URL`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `PORT` exist in `server/.env`. **No `server/.env.example` exists** (client has one).
- No rate limiting, no helmet, CORS is wide open.

## Gap List — Build Plan Phase × Current State

| Phase | Status | Notes |
|---|---|---|
| 1. Postgres + pgAdmin + core schema | **DONE (2026-06-10)** | Native Postgres 18 + bundled pgAdmin (no Docker — compose skipped, native path documented in `docs/pgadmin-setup.md`). Migration `20260610082556_assessment_platform` adds 14 tables with `Assessment*` naming to dodge legacy collisions: `AssessmentTopic/Question/Option`, `CodingProblem`, `TestCase`, `Company`, `AssessmentTest`, `TestSection(+Item)`, `TestAttempt`, `AttemptResponse`, `ProctoringEvent`, `AiInterview(+Turn)`. Added `server/scripts/db-health.ts`, `server/.env.example`, `ANTHROPIC_API_KEY`/`JUDGE0_URL` env placeholders. Untracked the committed Firebase key (still needs rotation). Handout PDF copied to `server/prisma/data/jv_handout.pdf` (gitignored). |
| 2. Seed handout content | **DONE except AI solve pass (2026-06-10)** | Pipeline: `server/scripts/extract_handout.py` (PDF→JSON, handles inline/two-column/parenthesized options, shared answer legends, Directions/Passage contexts) → `server/scripts/seed-handout.ts` (62-topic taxonomy + 868 questions, all `verified=false`). Report: **775 text-solvable, 91 need figures, 2 incomplete**. `server/scripts/solve-and-verify.ts` (two-pass `claude-opus-4-8`, structured JSON, resumable) is ready but **blocked: `ANTHROPIC_API_KEY` still empty in `server/.env`**. Admin review queue live: `/admin/review-queue` + `verify`/`reject` endpoints (`requireRole('ADMIN','EDUCATOR')`), client page `ReviewQueue.tsx` wired into Dashboard for admins. Admin login: `admin@example.com` / `password`. Smoke-tested: review queue returns 868 pending, students get 403. Note: legacy interview-prep tables (470-question JSON bank) remain empty — superseded by the assessment bank. |
| 3. Coding problems + sandbox | **DONE (2026-06-10)** | No Anthropic key → problems are **hand-authored, not LLM-generated**: `scripts/generate_dsa_problems.py` builds 14 original problems across 16 A2Z coding topics; every expected output is computed by *running* the stored Python reference, so they can't drift. Seeded via `scripts/seed-dsa.ts`: 14 `CodingProblem` + 164 `TestCase`. **Sandbox = Piston, not Judge0** (Judge0 needs cgroup v1; WSL ≥2.5 is v2-only). Stack: Docker Engine inside WSL2 Ubuntu (Docker Desktop's installer is broken on this machine), `docker-compose.yml` runs `ghcr.io/engineer-man/piston` on :2000, runtimes python 3.12/node 20/g++ 10.2/java 15 installed via `scripts/setup-piston.ts`. WSL plumbing in `~/.wslconfig`: `networkingMode=mirrored` (Windows↔WSL localhost), `vmIdleTimeout=86400000` (VM was killing Piston after 60s idle); `/etc/wsl.conf` boot-starts dockerd. `codeRunnerService.ts` + routes `/code/problems`, `/code/run`, `/code/submit` (hidden tests → score+categories only, optional attemptId persistence, 10 runs/min/user). `scripts/verify-dsa.ts`: **all 14 references green, 164/164 cases — every problem `verified=true`**. Smoke-tested end-to-end: correct solution 2/2 samples, wrong solution scored 8.3% on hidden tests. Monaco editor still pending (Phase 4 frontend). After a Windows reboot, any `wsl` command revives the sandbox (dockerd + Piston auto-start). |
| 4. Test platform (builder + runner) | **DONE (2026-06-10)** | Backend: `assessmentService.ts` (selection rules `ONE_PER_TOPIC`/`RANDOM` with `difficultyMix`+`verifiedOnly` — PROCTORED always enforces verified-only; attempt snapshot frozen at start; resume-not-duplicate; server-authoritative clock with hard expiry; grading with negative marking; **questions without a confirmed key are ungraded** — excluded from totals, reported as `ungraded`), routes in `routes/assessments.ts` (admin CRUD/publish/archive + student start/autosave/submit/review). Frontend: `TestBuilder.tsx` (sections, rules, 90/180 presets, toggles), `AssessmentList.tsx`, `AssessmentRunner.tsx` (consent gate, section navigator, server-synced countdown, 700ms-debounced autosave, flag-for-review, review grid, Monaco editor with language picker + Run-samples/Submit-hidden via Piston, scorecard with per-section/topic breakdown + worked solutions for verified questions). Seeded published sample: "Full Mock — Aptitude + Coding (90 min)" (`scripts/seed-sample-test.ts`). Verified: API E2E (`scripts/e2e-attempt.ts` — snapshot stability, resume, duplicate-start guard, post-submit save rejection) **and in-browser** (login → consent → answer MCQs → Monaco coding Q ran 2/2 samples and 10/10 hidden tests at 100%, persisted to the attempt; zero console errors). Note: app moved to **port 4100** (4000 is occupied by the user's MockBox app); `.claude/launch.json` added with `api`/`web` configs. |
| 5. Proctoring | **DONE (2026-06-10)** | Client (`client/src/hooks/useProctoring.ts`, PROCTORED attempts only): tab blur/focus + fullscreen-exit + copy/paste/right-click capture, batched to `POST /assessments/attempts/:id/events` every 5s; camera via getUserMedia 320×240 + **MediaPipe FaceDetector** (presence only, no identity) → FACE_NOT_DETECTED (3 consecutive misses) / MULTIPLE_FACES / NO_CAMERA, degrades gracefully when the model can't load; 60s low-res JPEG snapshots → `POST .../snapshot`; non-punitive amber warning banner + camera status indicator. Server: event-type whitelist, snapshot files under `server/uploads/proctoring/<attemptId>/` (gitignored), **consent enforced server-side** — PROCTORED payload withholds all items until `POST .../consent` sets `consentAt`. Admin: `GET /admin/attempts`, `GET /admin/attempts/:id/proctoring` (timeline + event counts), role-checked snapshot serving (student → 403, path traversal → 400, verified). Retention: `scripts/purge-snapshots.ts` (default 30 days) + `docs/proctoring-privacy.md`. Verified live: consent gate (0 items → 8 after consent), browser-dispatched blur/copy events landed in DB, NO_CAMERA recorded on denied webcam, banner rendered. |
| 6. Analysis reports | **DONE (2026-06-10)** | Student (runner result screen): score + section/topic breakdown, per-question time, worked explanations (verified questions only), ranked **weak-topic chips** + **"Practice your weak topics" CTA** → `POST /assessments/attempts/:id/practice-weak` auto-builds a published ONE_PER_TOPIC PRACTICE test from <60% topics (verified: 6 weak topics → 6-item practice test). Admin (`AdminReports.tsx` + Dashboard button): per-attempt report (`GET /admin/attempts/:id/report`) with response table, section breakdown, **proctoring timeline with auth-fetched snapshots** and an **integrity signal** (weighted event heuristic, CLEAN/LOW/MEDIUM/HIGH, explicitly labeled "signal, not verdict"); cohort analytics (`GET /admin/tests/:id/cohort`): score-distribution histogram, topic heatmap, hardest questions, completion rate, avg time; **CSV export** (`GET /admin/tests/:id/export.csv`). Also fixed during verification: startAttempt race (StrictMode double-mount created duplicate attempts — now deduped to the oldest open attempt). PDF export not implemented (CSV only). Legacy orphaned TestAnalysis pages remain unused. |
| 7. AI interview + scoring | **DONE (2026-06-10)** | Conversational mock interview on `AiInterview`/`AiInterviewTurn`. `llmService.ts` is provider-abstracted: `claude-opus-4-8` when `ANTHROPIC_API_KEY` is set, else Groq `llama-3.3-70b` **with automatic per-model fallback to `llama-3.1-8b-instant` when the 70b daily quota is exhausted** (Groq quotas are per model). Prompts/rubric editable in `server/ai/prompts/{interviewer,scorer}.md` (placeholder substitution, no rebuild). Flow: role picker → ~6 adaptive questions (behavioral → role-technical → light system-design → closing; difficulty adapts to prior answers; one question per turn) → auto-score on completion or "End & score now". Scoring: rubric 0–5 × {technical .3, problemSolving .25, communication .2, structure .15, roleFit .1} → overall /100, per-turn feedback persisted, summary {strengths, gaps, nextSteps}; defensive JSON extraction + clamping. Routes `/ai-interview/*`; UI `InterviewChat.tsx` (chat bubbles, Enter-to-send, past-interview list, report with rubric bars). Verified E2E: 3-question scripted interview scored 68.8/100 with sensible per-turn feedback; report UI renders 5 rubric bars + summary. Voice (STT/TTS) stretch goal not implemented. |
| Addendum: face-to-face interview + self-view camera | **DONE (2026-06-10)** | **Shared camera**: `useCameraStream` singleton (one getUserMedia per page, refcounted), `useFacePresence` extracted (MediaPipe presence + `captureFrame` for snapshots), `useProctoring` refactored to consume both. `<SelfViewCamera />` PiP rendered in BOTH the proctored runner and the interview room: mirrored, draggable to any corner (persisted, default bottom-right), minimize pill, ● REC dot, live face badge, NO_CAMERA state instead of a black box. **Interview room** (`InterviewRoom.tsx`): full-screen call UI — synthetic-AI-labeled avatar stage, bottom bar (mic toggle, push-to-talk, captions, end, timer), transcript panel, current-question strip, typed fallback always available. **Avatar**: `InterviewerAvatar` interface + default audio-reactive stylized SVG head (lip-sync from TTS amplitude, blinks, sway, listening/thinking/speaking cues); talking-head video providers documented (cost/latency/ToS/no-impersonation) but off by default. **Voice**: `TtsProvider` (Web Speech default; `AudioUrlTts` shows the real AnalyserNode path for backend TTS — speechSynthesis can't feed an analyser, so the default uses a boundary-pulsed envelope) + `SttProvider` (SpeechRecognition, PTT + browser-VAD auto-stop, interim captions, barge-in stops TTS). **Scoring contract unchanged** (same /ai-interview endpoints); new `AiInterview.proctoringSummary` (migration `interview_proctoring_summary`) stores face-presence counts → "Camera signal" chip in the report. Separate camera+mic consent gates the room; privacy doc updated (no raw audio/video stored). Verified live: consent → room (avatar/timer/captions/typed fallback/NO_CAMERA tile + REC), typed turn → Q2, clean turn orders, end → scored report with "no camera ×1" signal. **Fixed during verification**: double-submitted turns (POST inside a React state updater — StrictMode double-invokes them) + server out-of-turn guard so duplicate sends can never corrupt a transcript. |
| 8. Company-specific | **DONE (2026-06-10)** | "Profiles, not theft": `scripts/seed-companies.ts` seeds **JP Morgan** and **Standard Chartered** with pattern profiles (round structure, counts, difficulty mix, pass score, interview style) — facts only, no scraped question text; company tests draw from our own bank. `GET /companies`, `POST /companies/:id/practice-test` builds (once, then reuses) a published **PROCTORED** test from the profile, `companyId`-tagged. Interview style injects into the interviewer prompt via `{{styleNotes}}` — verified: the Standard Chartered interview's first question targeted the bank's "do the right thing" valued behaviour. UX: company cards in Mock Tests ("Take the {Company} pattern mock"), company picker in AI Interview, company badges on test cards/admin lists. Verified flow: build → reuse → consent → quant 10 + coding 1 items resolved. **Note:** logical/verbal rounds currently resolve to 0 items because 0 of those categories' questions are verified yet (PROCTORED never serves unverified content — by design); they fill in as solve-and-verify progresses. |

## Blockers / Decisions Needed Before or During Phase 1

1. **Docker**: not installed. Options: (a) install Docker Desktop (enables compose + Judge0 later — recommended), (b) stay native-Postgres (already works) and use a hosted/public code-execution API in Phase 3.
2. **Handout PDF + the two interview JSONs**: need to be placed at a known path (suggest `server/prisma/data/`).
3. **`ANTHROPIC_API_KEY`**: required from Phase 2's solve-and-verify onward (plan specifies Anthropic; repo currently uses Groq).
4. **Schema naming**: new assessment models will use non-colliding names; confirm preference (`AssessmentTest` vs renaming legacy `Test` → `LegacyTestResult`).
5. **Committed Firebase key** (`server/serviceAccountKey.json`): remove + rotate.
