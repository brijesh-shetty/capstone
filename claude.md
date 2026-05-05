# CLAUDE.md — Gamified Learning Platform

This file is the single source of truth for building and upgrading the platform.
Follow phases in order. Each phase builds directly on the previous one.

---

## Project overview

A gamified learning platform where students search any topic and learn through games.
College students additionally receive diagnostic tests, weakness detection, and auto-assigned remedial study plans.

**Target users:** School students (class 6–10), College students (class 11–degree), Educators
**Core loop:** Search topic → Play game → Earn XP → Take test (college) → Detect weakness → Assign remedial games → Retest

---

## Scalability design decision — AI-first question generation

**Questions are NOT stored in the database.** This was a deliberate architectural choice.

Storing questions statically fails at scale because:
- You would need thousands of hand-authored questions to cover every topic a student might search
- Questions become stale and repetitive — students see the same set after a few sessions
- Adding a new subject requires manual authoring effort before it can go live
- The question pool cannot adapt to difficulty based on student performance

**The solution: Claude generates questions on demand, Redis caches them.**

```
Student searches topic
        │
        ▼
Redis cache check  ──HIT──▶  Serve cached questions  ──▶  Game starts
        │
       MISS
        │
        ▼
Claude API generates questions
        │
        ▼
Parse + validate JSON
        │
        ├──▶  Store in Redis (TTL: 24h)
        │
        ▼
Game session starts
```

### What IS stored in the database (permanent)

| Table               | What it holds                                      | Why permanent                    |
|---------------------|----------------------------------------------------|----------------------------------|
| `users`             | Accounts, XP, level, streak                        | Identity — never regenerate      |
| `topics`            | Subject / topic / subtopic taxonomy                | The map Claude navigates         |
| `game_sessions`     | Session metadata (userId, topicId, score, XP)      | Needed for mastery calculation   |
| `question_attempts` | Per-question result (hash, correct, time, hint)    | Raw data for weakness detection  |
| `mastery_scores`    | Computed mastery per user per subtopic             | Drives study plans               |
| `tests`             | College test submissions and scores                | Academic record                  |
| `study_plans`       | Weak topic assignments                             | Drives the remedial loop         |

### What is NOT stored (generated fresh, cached in Redis)

| What                    | Where it lives       | TTL       |
|-------------------------|----------------------|-----------|
| Question text + options | Redis                | 24 hours  |
| Correct answer          | Redis (never client) | 24 hours  |
| Explanation text        | Redis                | 24 hours  |
| Hint text               | Redis                | 1 hour    |
| "Explain differently"   | Never cached         | Per-call  |

The `question_attempts` table stores only `questionHash` (a deterministic sha256 of the question text), not the question text itself. This is enough to compute mastery scores without storing content permanently.

---

## Tech stack

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| Frontend    | React + TypeScript + Tailwind CSS               |
| Backend     | Node.js + Express + TypeScript                  |
| Database    | PostgreSQL (via Prisma ORM)                     |
| Cache       | Redis — question cache + session state          |
| Auth        | JWT + bcrypt                                    |
| AI/LLM      | Anthropic Claude API (claude-sonnet-4-20250514) |
| Background  | BullMQ (post-game mastery recalculation jobs)   |
| Hosting     | Railway or Render (simple first deploy)         |

---

## Database schema

Lean schema. No questions table. No content tables.

```prisma
model User {
  id           String    @id @default(uuid())
  name         String
  email        String    @unique
  passwordHash String
  role         Role      @default(STUDENT)
  level        Int       @default(1)
  xpTotal      Int       @default(0)
  streakDays   Int       @default(0)
  lastActiveAt DateTime?
  createdAt    DateTime  @default(now())

  gameSessions  GameSession[]
  masteryScores MasteryScore[]
  tests         Test[]
  studyPlans    StudyPlan[]
}

enum Role { STUDENT  COLLEGE_STUDENT  EDUCATOR  ADMIN }

// Topics define the taxonomy Claude uses to generate questions.
// They do NOT hold questions — they are navigation nodes only.
model Topic {
  id        String   @id @default(uuid())
  subject   String   // e.g. "Physics"
  topic     String   // e.g. "Thermodynamics"
  subtopic  String   // e.g. "Carnot cycle"  ← this is what Claude receives
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  gameSessions  GameSession[]
  masteryScores MasteryScore[]
  studyPlans    StudyPlan[]
}

// Stores session metadata only. No question content.
model GameSession {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  topicId     String
  topic       Topic    @relation(fields: [topicId], references: [id])
  difficulty  Int      @default(2)
  score       Int      @default(0)
  xpEarned    Int      @default(0)
  durationSec Int      @default(0)
  playedAt    DateTime @default(now())

  attempts QuestionAttempt[]
}

// Stores per-question result without storing the question itself.
// questionHash = sha256(questionText).slice(0,16) — deterministic, reproducible.
model QuestionAttempt {
  id           String      @id @default(uuid())
  sessionId    String
  session      GameSession @relation(fields: [sessionId], references: [id])
  questionHash String      // identifies the question without storing it
  subtopic     String      // copied from topic for fast mastery queries
  difficulty   Int
  isCorrect    Boolean
  timeTakenMs  Int
  hintUsed     Boolean     @default(false)
}

model MasteryScore {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  topicId      String
  topic        Topic    @relation(fields: [topicId], references: [id])
  score        Float    @default(0)
  isWeak       Boolean  @default(false)
  attemptCount Int      @default(0)
  nextReviewAt DateTime?
  lastUpdated  DateTime @default(now())

  @@unique([userId, topicId])
}

model Test {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  subject     String
  totalMarks  Int
  scoredMarks Int
  takenAt     DateTime @default(now())

  testQuestions TestQuestion[]
}

// Test questions are also AI-generated. Store result only.
model TestQuestion {
  id           String  @id @default(uuid())
  testId       String
  test         Test    @relation(fields: [testId], references: [id])
  questionHash String
  subtopic     String  // critical — weakness detection reads this
  difficulty   Int
  isCorrect    Boolean
  marksAwarded Int     @default(0)
}

model StudyPlan {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  topicId     String
  topic       Topic    @relation(fields: [topicId], references: [id])
  priority    Priority @default(MEDIUM)
  isCompleted Boolean  @default(false)
  dueDate     DateTime?
  createdAt   DateTime @default(now())

  @@unique([userId, topicId])
}

enum Priority { HIGH  MEDIUM  LOW }
```

---

## Question generation service

This is the core of the platform. Every game session and test calls this.

```typescript
// services/questionService.ts
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { redis } from '../lib/redis';

const client = new Anthropic();

export interface GeneratedQuestion {
  hash: string;
  questionText: string;
  options: string[];      // always exactly 4
  correctAnswer: string;  // full text matching one of options
  explanation: string;
  difficulty: 1 | 2 | 3;
  subtopic: string;
}

const CACHE_TTL = 60 * 60 * 24; // 24 hours

function cacheKey(subtopic: string, difficulty: number, count: number): string {
  const norm = subtopic.toLowerCase().replace(/\s+/g, '_');
  return `q:${norm}:${difficulty}:${count}`;
}

export async function getQuestions(
  subtopic: string,
  difficulty: 1 | 2 | 3,
  count = 10
): Promise<GeneratedQuestion[]> {
  const key = cacheKey(subtopic, difficulty, count);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const questions = await generateFromClaude(subtopic, difficulty, count);
  await redis.set(key, JSON.stringify(questions), 'EX', CACHE_TTL);
  return questions;
}

async function generateFromClaude(
  subtopic: string,
  difficulty: 1 | 2 | 3,
  count: number
): Promise<GeneratedQuestion[]> {
  const diffLabel = ['easy', 'medium', 'hard'][difficulty - 1];

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Generate ${count} ${diffLabel}-difficulty MCQs about "${subtopic}".

Rules:
- Exactly 4 options per question (full text, not just A/B/C/D labels)
- correctAnswer must be the exact string of one option
- explanation: 1–2 sentences explaining why correct
- Questions must be factually accurate and unambiguous
- Mix question types: definitions, application, conceptual, calculation

Return ONLY valid JSON array, no markdown, no preamble:
[{ "questionText":"...","options":["...","...","...","..."],"correctAnswer":"...","explanation":"...","difficulty":${difficulty},"subtopic":"${subtopic}" }]`,
    }],
  });

  const raw = (message.content[0] as { type: string; text: string }).text.trim();
  const clean = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(clean);

  return parsed.map((q: Omit<GeneratedQuestion, 'hash'>) => ({
    ...q,
    hash: createHash('sha256').update(q.questionText).digest('hex').slice(0, 16),
  }));
}

export async function invalidateCache(subtopic: string) {
  const pattern = `q:${subtopic.toLowerCase().replace(/\s+/g, '_')}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}
```

---

## Hint and explanation services

```typescript
// services/hintService.ts
export async function getHint(questionHash: string, questionText: string): Promise<string> {
  const key = `hint:${questionHash}`;
  const cached = await redis.get(key);
  if (cached) return cached;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: `One-sentence hint (max 20 words) for this question WITHOUT revealing the answer: "${questionText}"`,
    }],
  });

  const hint = (msg.content[0] as { type: string; text: string }).text.trim();
  await redis.set(key, hint, 'EX', 3600);
  return hint;
}

// services/explanationService.ts
// Never cached — always personalised to the specific wrong answer
export async function getPersonalisedExplanation(
  questionText: string,
  correctAnswer: string,
  studentAnswer: string
): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    stream: true,
    messages: [{
      role: 'user',
      content: `A student answered "${studentAnswer}" to: "${questionText}"
Correct answer: "${correctAnswer}"
In 2–3 encouraging sentences, explain why their answer was wrong and the right reasoning.`,
    }],
  });
  // Stream this response directly to the client
  return msg; // caller handles SSE streaming
}
```

---

## Game session route (answer security pattern)

```typescript
// routes/games.ts

// GET /games/session/:topicId?difficulty=2
router.get('/session/:topicId', auth, async (req, res) => {
  const topic = await db.topic.findUnique({ where: { id: req.params.topicId } });
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  const difficulty = (parseInt(req.query.difficulty as string) || 2) as 1|2|3;
  const questions = await getQuestions(topic.subtopic, difficulty, 10);

  // Store full questions (with answers) in Redis under a session key
  const sessionKey = `session:${req.user.id}:${Date.now()}`;
  await redis.set(sessionKey, JSON.stringify(questions), 'EX', 3600);

  // Send questions to client WITHOUT correctAnswer or explanation
  res.json({
    sessionKey,
    topicId: topic.id,
    questions: questions.map(q => ({
      hash:         q.hash,
      questionText: q.questionText,
      options:      q.options,
      difficulty:   q.difficulty,
      // correctAnswer and explanation intentionally withheld
    })),
  });
});

// POST /games/session/submit
router.post('/session/submit', auth, async (req, res) => {
  const { sessionKey, topicId, answers, durationSec } = req.body;
  // answers: [{ hash, chosenAnswer, timeTakenMs, hintUsed }]

  const cached = await redis.get(sessionKey);
  if (!cached) return res.status(400).json({ error: 'Session expired' });

  const questions: GeneratedQuestion[] = JSON.parse(cached);
  const qMap = Object.fromEntries(questions.map(q => [q.hash, q]));

  let xp = 0;
  const attempts = answers.map((a: any) => {
    const q = qMap[a.hash];
    const isCorrect = q.correctAnswer === a.chosenAnswer;
    if (isCorrect) {
      xp += [XP_RULES.correct_easy, XP_RULES.correct_medium, XP_RULES.correct_hard][q.difficulty - 1];
      if (a.timeTakenMs < 5000) xp += XP_RULES.speed_bonus;
    }
    if (a.hintUsed) xp += XP_RULES.hint_used; // negative value
    return { questionHash: q.hash, subtopic: q.subtopic, difficulty: q.difficulty, isCorrect, timeTakenMs: a.timeTakenMs, hintUsed: a.hintUsed };
  });

  const score = Math.round((attempts.filter((a: any) => a.isCorrect).length / attempts.length) * 100);

  await db.gameSession.create({
    data: { userId: req.user.id, topicId, difficulty: 2, score, xpEarned: xp, durationSec, attempts: { create: attempts } },
  });

  await awardXp(req.user.id, xp);
  await masteryQueue.add('recalculate', { userId: req.user.id, topicId });

  // Now safe to reveal answers
  res.json({
    score, xpEarned: xp,
    results: answers.map((a: any) => ({
      hash:          a.hash,
      isCorrect:     qMap[a.hash].correctAnswer === a.chosenAnswer,
      correctAnswer: qMap[a.hash].correctAnswer,
      explanation:   qMap[a.hash].explanation,
    })),
  });
});
```

---

## Weakness detection algorithm

```typescript
// services/weaknessDetector.ts

const DIFFICULTY_WEIGHT = { 1: 0.8, 2: 1.0, 3: 1.3 };
const RECENCY_WEIGHTS   = [0.5, 0.3, 0.2];
const WEAK_THRESHOLD    = 60;

export function computeMastery(attempts: { isCorrect: boolean; difficulty: number }[]): number {
  const recent = attempts.slice(-3);
  let num = 0, den = 0;
  recent.forEach((a, i) => {
    const w = RECENCY_WEIGHTS[i] ?? 0.1;
    const d = DIFFICULTY_WEIGHT[a.difficulty as 1|2|3] ?? 1.0;
    num += a.isCorrect ? w * d : 0;
    den += w * d;
  });
  return den === 0 ? 0 : Math.round((num / den) * 100);
}

export function classifyTopic(score: number) {
  if (score < WEAK_THRESHOLD - 20) return { isWeak: true, priority: 'HIGH' as const };
  if (score < WEAK_THRESHOLD)      return { isWeak: true, priority: 'MEDIUM' as const };
  return { isWeak: false, priority: 'NONE' as const };
}

export async function recalculateMastery(userId: string, topicId: string) {
  const attempts = await db.questionAttempt.findMany({
    where: { session: { userId, topicId } },
    orderBy: { session: { playedAt: 'asc' } },
    select: { isCorrect: true, difficulty: true },
  });

  const score = computeMastery(attempts);
  const { isWeak, priority } = classifyTopic(score);
  const due = new Date();
  due.setDate(due.getDate() + 3);

  await db.masteryScore.upsert({
    where:  { userId_topicId: { userId, topicId } },
    update: { score, isWeak, attemptCount: attempts.length, lastUpdated: new Date() },
    create: { userId, topicId, score, isWeak, attemptCount: attempts.length },
  });

  if (isWeak) {
    await db.studyPlan.upsert({
      where:  { userId_topicId: { userId, topicId } },
      update: { priority, isCompleted: false, dueDate: due },
      create: { userId, topicId, priority, dueDate: due },
    });
  }
}
```

---

## XP system

```typescript
// services/xpService.ts

export const XP_RULES = {
  correct_easy:         10,
  correct_medium:       18,
  correct_hard:         25,
  speed_bonus:           5,
  daily_streak_7:      100,
  topic_completed:      50,
  weak_topic_mastered: 150,
  perfect_test:        200,
  hint_used:            -5,  // deducted
};

const LEVEL_THRESHOLDS = [0, 500, 1200, 2000, 3200, 5000, 8000, 12000, 18000];
// Level titles:        1       2       3      4       5     6      7       8       9
// Rookie  Explorer  Apprentice  Scholar  Expert  Master  Champion  Legend  Grandmaster

export async function awardXp(userId: string, amount: number) {
  await db.user.update({ where: { id: userId }, data: { xpTotal: { increment: amount } } });
  await checkLevelUp(userId);
}

async function checkLevelUp(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const newLevel = LEVEL_THRESHOLDS.findLastIndex(t => user.xpTotal >= t) + 1;
  if (newLevel !== user.level)
    await db.user.update({ where: { id: userId }, data: { level: newLevel } });
}
```

---

## API routes

```
POST   /auth/register
POST   /auth/login

GET    /topics/search?q=&subject=           ← searches topic taxonomy, not questions
GET    /topics/:id
GET    /topics/:id/summary                  ← AI-generated 3-bullet primer (Redis 7d TTL)

GET    /games/session/:topicId?difficulty=  ← calls questionService, returns questions (no answers)
POST   /games/session/submit                ← validate server-side, save hashes, trigger mastery job
POST   /games/hint                          ← { questionHash, questionText } → hint string
POST   /games/explain                       ← { questionText, correctAnswer, studentAnswer } → streamed

POST   /tests/generate                      ← college: generate balanced test by subject
POST   /tests/submit                        ← validate, store hashes, run mastery jobs

GET    /dashboard                           ← stats, weak topics, study plan
GET    /mastery                             ← full mastery scores for user
GET    /study-plan                          ← ordered by priority + due date

GET    /leaderboard?subject=&period=
```

---

## Seed data requirements

The seed file only needs to create the topic taxonomy — zero question authoring needed.

```typescript
// prisma/seed.ts
const topics = [
  { subject: 'Physics',   topic: 'Thermodynamics',     subtopic: 'Laws of thermodynamics' },
  { subject: 'Physics',   topic: 'Thermodynamics',     subtopic: 'Carnot cycle' },
  { subject: 'Physics',   topic: 'Mechanics',          subtopic: "Newton's laws of motion" },
  { subject: 'Physics',   topic: 'Electromagnetism',   subtopic: 'Electromagnetic induction' },
  { subject: 'Physics',   topic: 'Optics',             subtopic: 'Wave optics' },
  { subject: 'Physics',   topic: 'Modern Physics',     subtopic: 'Quantum numbers' },
  { subject: 'Chemistry', topic: 'Organic Chemistry',  subtopic: 'Organic reactions' },
  { subject: 'Chemistry', topic: 'Electrochemistry',   subtopic: 'Electrochemical cells' },
  { subject: 'Chemistry', topic: 'Chemical Bonding',   subtopic: 'Molecular orbital theory' },
  { subject: 'Chemistry', topic: 'Thermochemistry',    subtopic: 'Enthalpy and entropy' },
  { subject: 'Maths',     topic: 'Calculus',           subtopic: 'Differential calculus' },
  { subject: 'Maths',     topic: 'Calculus',           subtopic: 'Integral calculus' },
  { subject: 'Maths',     topic: 'Algebra',            subtopic: 'Matrices and determinants' },
  { subject: 'Maths',     topic: 'Probability',        subtopic: 'Bayes theorem' },
  { subject: 'Maths',     topic: 'Coordinate Geometry',subtopic: 'Conic sections' },
];
// Claude generates questions for any of these on demand.
// No question seeding. No content authoring before launch.
```

---

## Phase-by-phase build plan

---

### Phase 1 — Core prototype (weeks 1–4)

**Goal:** End-to-end loop: student searches a topic, plays a Claude-generated game, earns XP.

1. Project setup — monorepo, PostgreSQL + Redis local, `prisma migrate dev`, `.env` with all keys
2. Auth — register/login, JWT middleware
3. Topic taxonomy — seed 15 topics, `GET /topics/search?q=`
4. Game session — implement `questionService.ts`, session route (no answers to client), submit route (server-side validation)
5. XP + profile page

**Acceptance criteria:**
- [ ] Questions generated by Claude and cached in Redis — never in PostgreSQL
- [ ] Correct answers never sent to client before submit
- [ ] `question_attempts` stores only `questionHash`, not question text
- [ ] XP awarded and reflected on profile

---

### Phase 2 — Gamification layer (weeks 5–7)

**Goal:** Make it feel like a game, not a quiz tool.

1. Streaks — `lastActiveAt` tracking, streak increment/reset, milestone XP bonuses
2. Level system — `LEVEL_THRESHOLDS`, level-up toast, level title display
3. Leaderboard — `GET /leaderboard`, top 10 + current user
4. Badges — `Badge` table, first game / 7-day streak / first mastered / weak cleared / perfect score
5. Adaptive difficulty — Redis session state, 3 correct → difficulty+1, 2 wrong → difficulty-1
6. Extra game formats — match-the-pair (Claude returns term+definition pairs), story quiz (Claude wraps MCQs in scenario)

**Acceptance criteria:**
- [ ] Streaks work correctly across day boundaries
- [ ] Adaptive difficulty shifts mid-session
- [ ] 3 badge types working end-to-end

---

### Phase 3 — College test + weakness detection (weeks 8–11)

**Goal:** The diagnostic engine — the platform's core differentiator.

1. Test generation — `POST /tests/generate`, balances questions across subtopics, stores in Redis test session key
2. Test submission — server-side validation, store `TestQuestion` rows with `questionHash + subtopic`
3. Weakness detection job — BullMQ fires after every session and test submit, runs `recalculateMastery`
4. College dashboard — weak topics chart, study plan queue with priority badges and Play button
5. Educator class report — aggregate per-subtopic accuracy across all students

**Acceptance criteria:**
- [ ] Mastery scores update within 5 seconds of submission
- [ ] Study plan auto-populates with correct priority classification
- [ ] Weak-topic-mastered XP (150) fires when threshold crossed
- [ ] Educator sees per-subtopic accuracy across class

---

### Phase 4 — Hint + personalised explanation (weeks 12–14)

**Goal:** Make wrong answers a learning moment, not just a failure signal.

1. Hint system — `POST /games/hint`, Redis 1h TTL, -5 XP deduction, logged on attempt
2. Personalised explanation — `POST /games/explain`, never cached, streamed SSE response
3. Topic summary card — `GET /topics/:id/summary`, Redis 7d TTL, 3-bullet primer before game
4. Concept explainer mode — optional pre-game streaming explanation of the subtopic

**Acceptance criteria:**
- [ ] Hints < 500ms on cache hit, < 3s on miss
- [ ] "Explain differently" response is specific to the student's wrong answer
- [ ] Topic summary loads before game session starts

---

### Phase 5 — Social and spaced repetition (weeks 15–20)

**Goal:** Long-term retention and competitive engagement.

1. Spaced repetition — `nextReviewAt` on `MasteryScore`, correct easy→+7d / hard→+3d / wrong→today, "Due today" dashboard section
2. Peer battle — `Battle` table, async 1v1, same Redis cache key = identical question set, winner +50 XP
3. Question quality flags — `QuestionFlag` table, 3 flags → `invalidateCache` → Claude regenerates fresh on next request
4. Personalised difficulty calibration — `recommendedDifficulty(userId, topicId)` based on mastery score, auto-set on session start
5. PDF progress report — Puppeteer, per-subject mastery heatmap, XP timeline, downloadable + shareable link

**Acceptance criteria:**
- [ ] Spaced repetition due dates correct across all score scenarios
- [ ] Peer battle completes full async cycle
- [ ] 3 flags on a question invalidates cache and forces Claude regeneration
- [ ] PDF report generates and downloads correctly

---

## Folder structure

```
/
├── client/src/
│   ├── pages/          Auth, Dashboard, GameSession, TestPortal, StudyPlan, Leaderboard, Profile
│   ├── components/     QuestionCard, XPBar, MasteryChart, WeakTopicList, GameTimer
│   └── services/api.ts
│
├── server/src/
│   ├── routes/         auth, topics, games, tests, dashboard
│   ├── services/       questionService, hintService, explanationService, weaknessDetector, xpService
│   ├── jobs/           masteryJob.ts
│   ├── lib/            redis.ts
│   └── middleware/     auth.ts
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts         ← topic taxonomy only
│
└── CLAUDE.md
```

---

## Redis key schema

| Key pattern                         | Content                          | TTL      |
|-------------------------------------|----------------------------------|----------|
| `q:{subtopic}:{difficulty}:{count}` | JSON array of GeneratedQuestion  | 24 hours |
| `session:{userId}:{timestamp}`      | JSON array of GeneratedQuestion  | 1 hour   |
| `test:{userId}:{timestamp}`         | JSON array of GeneratedQuestion  | 3 hours  |
| `hint:{questionHash}`               | Hint string                      | 1 hour   |
| `summary:{topicId}`                 | 3-bullet summary string          | 7 days   |
| `session:{sessionId}:state`         | Adaptive difficulty state JSON   | 1 hour   |

---

## Environment variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/learndb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_here
ANTHROPIC_API_KEY=your_anthropic_key_here
PORT=4000

VITE_API_URL=http://localhost:4000
```

---

## Key invariants — never break these

1. **Questions are never stored in PostgreSQL.** `question_attempts` stores only `questionHash` + metadata.
2. **Correct answers are never sent to the client** before submit. They live in Redis under a server-side session key only.
3. **All answer validation happens server-side.** The submit route retrieves questions from Redis and checks answers there.
4. **`mastery_scores` is always computed from raw `question_attempts`.** Never manually set from a route handler.
5. **`study_plans` are only created/updated by the BullMQ background job.** Never write to `study_plans` directly from a route.
6. **Cache keys must include difficulty and count** so a difficulty-1 cache hit is never served to a difficulty-3 request.
7. **After 3 question flags on the same hash, call `invalidateCache` immediately.** Claude regenerates fresh questions on the next request.

---

## Definition of done (per phase)

A phase is complete when:
- All acceptance criteria checkboxes are passing
- `tsc --noEmit` passes with zero errors
- No `questions` or `question_content` table exists in PostgreSQL
- Redis cache hit rate > 60% after 10 sessions on any single subtopic
- Weakness detector produces correct classifications in `__tests__/weaknessDetector.test.ts`