# Plan: LearnHub → Interview-Preparation-First Platform

_Drafted 2026-07-06. Goal: restructure the site so Interview Preparation is the primary product, fix the question-data quality issues, and build out company-wise, CS-core-theory, coding-track, and games-based-study sections._

---

## 0. What already exists (build on, don't rebuild)

| Capability | Where | State |
|---|---|---|
| Aptitude question bank (868 Qs: Quant/Logical/Verbal) | `AssessmentQuestion` tables, seeded from `handout_questions.json` | Seeded, mostly unverified; 91 need figures |
| Mock test builder + proctored runner + analysis | `assessmentService.ts`, `AssessmentRunner.tsx`, `AdminReports.tsx` | Working E2E |
| Coding sandbox (Piston) + 14 DSA problems + Monaco | `codeRunnerService.ts`, `/code/*` routes | Working, all 14 verified |
| AI mock interview (chat + face-to-face room, scoring rubric) | `aiInterviewService.ts`, `InterviewChat.tsx`, `InterviewRoom.tsx` | Working |
| Company pattern profiles (JP Morgan, Standard Chartered) | `Company` model, `seed-companies.ts`, `CompanyPrep.tsx` | Working but thin — 2 companies, pattern mock only |
| XP / achievements / streaks / leaderboard | `xpService.ts`, `leaderboard.ts`, `Leaderboard.tsx` | Working |
| 7 game engines (Memory Match, Hangman, Crossword, …) | `client/src/pages/games/`, `gameContentService.ts` | Working for learning domains, not yet wired to interview theory |
| Admin review queue for unverified questions | `ReviewQueue.tsx`, `/admin/review-queue` | Working |

---

## 1. New Information Architecture (Interview Prep = home page)

After login, land on an **Interview Prep Hub** (replaces the current learning-domains-first dashboard). Sections:

1. **📊 My Readiness** (dashboard strip + right sidebar everywhere)
   - Readiness score, streak, XP/rank, weak topics, recent activity, mini leaderboard (top 5 + your rank).
2. **🧮 Aptitude** — existing Quant / Logical / Verbal bank (after data-quality fixes below).
3. **📚 CS Core Subjects** *(new)* — OS, DBMS, CN, OOPs (extensible: SQL, System Design, Software Engineering).
   - Each subject = theory notes (chapter-wise) + topic MCQ practice + subject mock test.
4. **💻 Coding Practice** — level-based tracks with completion states (see §4).
5. **🏢 Company-Wise Prep** *(major expansion)* — per company: Coding | Technical | HR | Pattern Mock | AI Interview (see §3).
6. **🗣️ HR & Behavioral** *(new)* — HR question bank with model-answer frameworks (STAR), + the existing AI interview room for practice.
7. **📝 Mock Tests** — existing assessment list/builder/runner.
8. **🎮 Study Games** — games as a study technique for interview theory (see §6).
9. Existing learning domains move to a secondary "Learning" nav item — nothing is deleted.

Frontend: `App.tsx` gets a persistent left nav (sections above) + right stats sidebar component (`<StatsSidebar/>`) rendered on hub/section pages. New `InterviewHome.tsx` replaces Dashboard as the default page.

---

## 2. Data-quality fixes (do FIRST — everything else sits on this data)

The three reported bugs and their fixes:

### 2a. Missing context ("How is A related to B?" with no info about A and B)
- Root cause: the PDF extractor (`scripts/extract_handout.py`) splits question blocks but doesn't always attach the shared **Directions / passage / data block** that precedes a group of questions (blood relations, seating arrangement, DI tables, RC passages).
- Fix:
  1. Re-run extraction with **group-context detection**: a `Directions (Q. x–y):` / passage / data-table block becomes `context` on every question in its range (the field already exists in the JSON and can map to `AssessmentQuestion.assets.context`).
  2. **Audit script**: flag questions whose stem references entities never defined in stem+context (pronouns like "the above data", names like "A, B, C", "the following table") → send to review queue.
  3. LLM audit pass (Groq or Claude) over all 868: classify `SELF_CONTAINED / NEEDS_CONTEXT_FOUND / NEEDS_CONTEXT_MISSING / NEEDS_FIGURE`. `NEEDS_CONTEXT_MISSING` questions get `verified=false` + hidden from students until fixed.
- Schema: add `contextText String?` and `groupKey String?` (so grouped questions can be served together in tests, like RC passages) to `AssessmentQuestion`.

### 2b. Diagrams/figures not displayed (91 flagged `requiresImage`)
- Fix pipeline:
  1. `scripts/extract_figures.py` — render the PDF page region for each flagged question with PyMuPDF (fitz), crop the figure, save to `server/prisma/data/assets/q<id>.png` (gitignored, same as the handout) and serve from `server/uploads/question-assets/`.
  2. Populate `assets.images: string[]` on the question; extend the runner + quiz components to render `<QuestionAssets/>` (images above options, zoom on click).
  3. Manual pass in the admin Review Queue: add an "attach/crop image" tool (upload + crop) for the ones auto-crop gets wrong.
  4. Until an image is attached, `requiresImage && !assets.images` questions stay hidden from students (already the spirit of verified-only).

### 2c. Formulas rendered wrong (superscripts/fractions flattened by PDF text extraction)
- Fix:
  1. Add **KaTeX** to the client; a shared `<RichQuestionText/>` renders `$...$` LaTeX segments, line breaks, and tables in stem/options/solutions.
  2. LLM cleanup pass (one-off script, resumable like `solve-and-verify.ts`): rewrite mangled stems into clean text + LaTeX (e.g. `x2 + 3x` → `$x^2 + 3x$`), store in `stem`, keep original in `assets.rawStem` for audit. Changed questions go to review queue before re-verification.
  3. This same renderer fixes theory notes formula boxes.

### 2d. Finish verification
- `solve-and-verify.ts` exists but is blocked on `ANTHROPIC_API_KEY`. Either supply the key or add a Groq fallback mode with a stricter two-model agreement check. Target: all text-solvable questions `verified=true` so company/proctored tests stop coming up empty for Logical/Verbal.

**Deliverable of Phase A: a clean, trustworthy bank — every visible question is self-contained, renders math properly, and shows its figure.**

---

## 3. Company-Wise Prep (the centerpiece)

### Data model
```prisma
model Company {
  // existing: name, pattern profile, styleNotes ...
  logo        String?
  about       String?
  roles       Json?     // e.g. ["SDE", "Analyst"]
  sections    CompanyQuestion[]
}

model CompanyQuestion {           // join/tag table — questions & problems tagged per company
  id          String @id @default(uuid())
  companyId   String
  kind        CompanyQKind        // CODING | TECHNICAL | HR
  questionId  String?             // -> AssessmentQuestion (technical MCQ/short answer)
  problemId   String?             // -> CodingProblem
  hrPrompt    String?             // HR question text (for kind=HR)
  hrGuidance  String?             // model-answer framework / what interviewers look for
  frequency   String?             // "frequently asked", year tags
  roleTag     String?
}
```
Content policy stays "profiles, not theft": tag **our own** bank's questions as "asked-at-style" per company + author original HR/technical questions matching each company's publicly known pattern. No scraped proprietary question text.

### Company page (`CompanyDetail.tsx`) — tabs, each developed as its own section:
1. **Overview** — pattern (rounds, counts, difficulty, cutoff), roles, prep checklist.
2. **💻 Coding** — company-tagged coding problems in the test interface (§4), filterable by role/difficulty; "Company coding round simulation" = timed set matching their round profile.
3. **🛠️ Technical** — company-tagged CS-core + aptitude MCQs; practice mode (instant feedback) and round-simulation mode (timed, scored).
4. **🧑‍💼 HR** — company HR question list with STAR guidance + "Practice this question in AI Interview" deep link (interviewer prompt gets company styleNotes + the chosen question).
5. **📝 Pattern Mock** — existing `POST /companies/:id/practice-test` proctored mock.
6. Per-company progress: `%` complete per tab, shown on the company card grid.

### Seed more companies
Extend `seed-companies.ts`: TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini, Amazon, Microsoft, Deloitte (public pattern facts only). Add admin CRUD for companies (builder UI later; JSON seed first).

---

## 4. CS Core Subjects section (OS, DBMS, CN, OOPs)

- **Taxonomy**: reuse `AssessmentTopic` with a new category `CS_CORE` and a `subject` field (`OS | DBMS | CN | OOPS`), each subject having 8–12 chapter topics (e.g. DBMS: ER model, Normalization, Transactions, Indexing, SQL, Concurrency…).
- **Source (confirmed 2026-07-06)**: user supplied a merged interview-notes PDF (Apni Kaksha notes) covering all four subjects — OS (types, scheduling, critical section, semaphores/mutex, deadlock, memory mgmt, page replacement, disk scheduling, key terms), OOPs (class/object, 4 pillars, constructors/destructor, virtual/pure-virtual, friend, access specifiers, overload vs override with C++ examples), DBMS & SQL (ER model, keys, FDs, normalization, transactions/ACID, schedules/serializability, relational algebra, indexes/B/B+ trees, full SQL command reference), CN (topologies, network types, VPN, OSI 7 layers, TCP/IP, HTTP/HTTPS, DNS, TCP vs UDP, protocol glossary, "what happens when you type google.com"). Place at `server/prisma/data/cs_core_notes.pdf` (gitignored like the JV handout) and run an extraction pass (same pattern as `extract_handout.py`) → chapter-structured theory JSON → seed. Diagrams in the PDF (ER example, key hierarchy, transaction states, topology figures, schedule tree) go through the same figure-crop pipeline as §2b.
- **Content per topic**:
  - **Theory notes** — reuse the `InterviewTheory`-style structure (sections, key points, formula/definition boxes) rendered by the same `<RichQuestionText/>`; author via LLM generation → admin review queue → verified flag (same trust pipeline as questions).
  - **MCQ bank** — 20–30 per topic: seed from curated JSON where available + LLM-generated-then-verified for gaps.
  - **Interview-style short answers** — "Explain deadlock vs starvation" cards with model answers (used by games + AI interview).
- **Subject page** (`SubjectHub.tsx`): chapter grid with completion states → each chapter: Study Notes | Practice MCQs | Play Games; subject-level mock test button (uses existing assessment engine with `subject` filter).

---

## 5. Coding section — level-based tracks with completion

- **Levels**: group problems into tracks (per topic: Arrays, Strings, DP, …) × levels (Level 1 Easy → Level N Hard). Schema: add `level Int`, `track String` to `CodingProblem`; new `UserProblemStatus` (userId, problemId, status: `UNATTEMPTED | ATTEMPTED | SOLVED`, bestScore, solvedAt).
- **Completion rules**: level shows ✅ when all its problems are SOLVED (100% hidden tests); next level unlocks (or soft-unlock with a "recommended order" badge — decide during build).
- **Test interface**: reuse the Monaco + Piston runner from `AssessmentRunner.tsx`, extracted into a standalone `ProblemSolver.tsx` (problem statement, examples, editor, run samples / submit hidden, verdict history).
- **More problems**: extend `scripts/generate_dsa_problems.py` from 14 → ~60 (4–5 per track/level), keeping the "expected outputs computed by running the reference" guarantee.
- **Syllabus source (confirmed 2026-07-06)**: Striver's SDE Sheet (takeuforward.org/dsa/strivers-sde-sheet-top-coding-interview-problems) — use its day/topic structure (Arrays, Linked List, Greedy, Recursion/Backtracking, Binary Search, Heaps, Strings, Trees, BST, Graphs, DP, Trie) as the track map and problem checklist; write **original problem statements** for each concept (never copy LeetCode/GfG text), author a Python reference, and generate cases per the existing recipe.
- **Progress UI**: track map (levels as nodes, completed/current/locked), per-track % on the coding hub, feeds readiness score + XP + leaderboard.

---

## 6. Games as a study technique for interview prep

Wire the existing 7 engines to interview/CS-core theory data (static, from DB — no LLM at play time):
| Game | Interview-prep content source |
|---|---|
| Memory Match | formula ↔ name pairs from `InterviewTheory.formulas` / CS-core definition pairs (e.g. "TCP" ↔ "connection-oriented") |
| Fill-the-Blank | formulas with blanks (`SI = P × R × __ / 100`), OS/DBMS definitions |
| Hangman / Word Scramble | key terms from topic keyPoints ("NORMALIZATION", "SEMAPHORE") |
| Crossword | term + clue pairs from key concepts |
| Concept Cannon | true/false statements from theory |
| Quiz (existing) | topic MCQs |
- Implementation: `gameContentService.ts` gets a `source: 'interview' | 'cs-core'` mode that builds game payloads from theory tables. Entry points: "🎮 Study with Games" button on every topic/chapter page + the Study Games hub. Game XP counts toward the same progression.

---

## 7. HR & Behavioral section

- `HrQuestion` bank (question, category: intro/strengths/failure/conflict/why-us…, STAR guidance, sample answer outline, companyTags).
- Page: browse by category/company → read guidance → "Practice with AI" (opens InterviewRoom seeded with that question; existing scorer gives feedback per answer).
- Seed ~60 standard HR questions + per-company tagged ones.

---

## 8. Leaderboard + stats at the side

- `<StatsSidebar/>` (rendered on hub + section pages): XP/rank/streak, readiness score dial, 3 weakest topics with "Practice" links, mini leaderboard (top 5 + your position), recent badges.
- Leaderboard page upgrades: filters (overall | coding | aptitude | CS core | weekly), college/cohort filter (Role enum already exists), and per-company mock leaderboards.
- Backend: extend `leaderboard.ts` with scoped queries; snapshot weekly boards via existing BullMQ.

---

## 9. Build order (phases, each independently shippable)

| Phase | Scope | Est. effort |
|---|---|---|
| **A. Data quality** (§2) | context re-extraction + audit, figure pipeline + renderer, KaTeX + formula cleanup, finish verification | 3–4 sessions — **do first** |
| **B. IA restructure** (§1, §8) | Interview home page, left nav, StatsSidebar, leaderboard filters | 1–2 sessions |
| **C. Company-wise** (§3) | schema + tagging, CompanyDetail tabs (Coding → Technical → HR, one at a time), seed 8–10 companies | 3–4 sessions |
| **D. Coding tracks** (§5) | levels/tracks schema, ProblemSolver page, completion map, +46 problems | 2–3 sessions |
| **E. CS Core** (§4) | taxonomy + theory pipeline + MCQ seeding for OS → DBMS → CN → OOPs (one subject at a time) | 3–4 sessions |
| **F. HR bank** (§7) | HrQuestion model + page + AI-interview deep link | 1 session |
| **G. Study games** (§6) | gameContentService interview mode + entry points | 1–2 sessions |

Dependencies: A blocks C/E quality; B is independent; C-Technical depends on E for CS-core tags (ship C with aptitude+coding tags first); F and G are independent.

---

## 10. Decisions needed

1. **ANTHROPIC_API_KEY** for solve-and-verify, or accept Groq two-model agreement fallback?
2. Coding levels: hard-locked progression vs. soft "recommended order"?
3. CS-core MCQ sourcing: any curated JSON banks available (like the aptitude handout), or fully LLM-generate + review-queue verify?
4. Which companies first? (suggest: TCS, Infosys, Wipro, Accenture, Amazon + existing 2)
