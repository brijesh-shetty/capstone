# Implementation Status

_Last updated: 2026-07-07. Companion to [docs/interview-platform-plan.md](docs/interview-platform-plan.md) (full build plan) and [STATUS.md](STATUS.md) (platform audit)._

## ✅ Implemented

### Platform base (Phases 1–8, June 2026)
- **Aptitude bank** — 868 questions (Quant / Logical / Verbal) seeded from the handout, 62-topic taxonomy
- **Mock test engine** — builder, proctored runner (camera + tab-switch + fullscreen detection, consent gate), server-authoritative grading, autosave/resume, scorecard with weak-topic analysis + practice-test generation, admin cohort reports, CSV export
- **Coding** — Piston sandbox (Python / JS / C++ / Java), 14 verified DSA problems with 164 run-the-reference test cases, Monaco editor, run-samples / submit-hidden
- **AI interview** — chat + face-to-face room (avatar, voice, captions, camera signal), rubric scoring /100
- **Company prep (v1)** — 13 companies with pattern profiles, pattern mocks, company-styled AI interviews
- **Gamification** — XP, ranks, streaks, achievements, leaderboard, 7 game engines (learning domains only)
- **Admin review queue** for unverified questions

### Data-quality work — Phase A (2026-07-07 session)
- **Context audit** (`server/scripts/audit-context.ts`, Gemini/Groq providers, resumable): 856/868 audited.
  Result: **712 self-contained · 46 missing context** (the "How is A related to B?" bug) **· 95 need figures · 3 incomplete · 12 pending re-run**
- **Broken questions hidden** — test assembly (`assessmentService.ts`) now excludes audit-flagged, incomplete, and image-less figure questions on all test types
- **Review queue** — new "🧩 Missing Context" filter + audit badges with hover reasons
- **Formula rendering** — KaTeX + `client/src/components/RichText.tsx` (renders `$...$` / `$$...$$` in stems, options, context, explanations in the runner)
- **Cross-model verification** — `solve-and-verify.ts` upgraded: Gemini pass A + Groq pass B must independently agree before auto-verify
- **CS-core notes PDF** staged at `server/prisma/data/cs_core_notes.pdf` (gitignored) — OS, OOPs, DBMS+SQL, CN

---

## ⏳ Left to do

### Phase A remainder (data quality)
| Task | Blocker | Command / where |
|---|---|---|
| Solve-and-verify run (~740 questions → verified answer keys) | API quotas reset ~midnight PT (Gemini free tier + Groq 70b/day both spent) | `cd server && npx ts-node scripts/solve-and-verify.ts` |
| Finish last 12 audit questions | none — just rerun | `npx ts-node scripts/audit-context.ts --provider groq --batch 12` |
| Figure-crop pipeline for 95 image questions | **needs `B2_course materials_60hr.pdf` re-supplied** (gone from this machine) | new `scripts/extract_figures.py` (PyMuPDF) → `assets.images` → render in runner |
| Repair the 46 missing-context questions | manual (review queue) or re-extraction once handout PDF is back | admin → Review Queue → 🧩 Missing Context |
| Formula-cleanup LLM pass (mangled stems → LaTeX for RichText) | same quota reset | new script, pattern of solve-and-verify |

### Phase B — Interview-first IA (not started)
- Interview Prep home page replacing Dashboard as landing
- Persistent left nav (Aptitude / CS Core / Coding / Companies / HR / Mock Tests / Games)
- `<StatsSidebar/>` — XP, streak, readiness, weak topics, mini leaderboard
- Leaderboard filters (overall / coding / aptitude / weekly / company)

### Phase C — Company-wise sections (not started)
- `CompanyQuestion` tag table (kind: CODING | TECHNICAL | HR)
- `CompanyDetail.tsx` with tabs: Overview · Coding · Technical · HR · Pattern Mock · AI Interview
- Per-company progress %, company-tagged question/problem sets
- HR guidance per company + "Practice in AI Interview" deep link

### Phase D — Coding tracks (not started)
- `level`/`track` on CodingProblem, `UserProblemStatus` (solved/attempted), completion map UI
- Standalone `ProblemSolver.tsx` extracted from the runner
- ~46 new problems over the Striver SDE-sheet syllabus (original statements, run-the-reference cases)

### Phase E — CS Core subjects (PDF staged, extraction not started)
- Extraction script for `cs_core_notes.pdf` → chapter-structured theory JSON (OS / OOPs / DBMS+SQL / CN)
- `CS_CORE` taxonomy + theory pages + per-chapter MCQs (LLM-generate → review queue → verify)
- Subject mock tests via existing assessment engine

### Phase F — HR & behavioral bank (not started)
- `HrQuestion` model, ~60 standard questions with STAR guidance, company tags
- Browse page + AI-interview deep link

### Phase G — Study games for interview prep (not started)
- `gameContentService` interview/CS-core mode (Memory Match formulas, Fill-the-Blank, Hangman terms, Concept Cannon true/false)
- "🎮 Study with Games" entry points on topic/chapter pages

### Cross-cutting
- Curate 1–2 YouTube links per CS-core chapter (`resources` field + embed component)
- Rotate the previously committed Firebase service key (still pending from Phase 1)
- Consider paid-tier Gemini key to unblock LLM passes at scale
