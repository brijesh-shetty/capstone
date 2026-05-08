# CLAUDE.md — LearnHub: Gamified Learning Platform

> **Single source of truth.** Follow phases in order. Each phase builds directly on the previous one.
> AI coding agent: read this entire file before writing a single line of code.

---

## Project Overview

A full-stack gamified learning platform where students search any topic and learn through AI-generated game sessions. College students additionally take diagnostic tests, receive automatic weakness detection, and are assigned remedial study plans.

**Target users:** School students (Class 6–10), College students (Class 11–Degree), Educators
**Core loop:**
```
Search topic → Play game → Earn XP → Take test (college) → Detect weakness → Assign remedial games → Retest
```

---

## Scalability Design Decision — AI-First Question Generation

**Questions are NEVER stored in the database.** This is a deliberate architectural choice.

Storing questions statically fails at scale because:
- Thousands of hand-authored questions are needed to cover every topic
- Questions become stale and repetitive across sessions
- Adding a new subject requires manual authoring before launch
- The pool cannot adapt to difficulty based on student performance

**The solution: Claude generates questions on demand, Redis caches them.**

```
Student searches topic / starts test
        │
        ▼
Redis cache check ──HIT──▶ Serve cached questions ──▶ Game/Test starts
        │
       MISS
        │
        ▼
Claude API generates questions
        │
        ▼
Parse + validate JSON
        │
        ├──▶ Store in Redis (TTL: 24h for games, 3h for tests)
        │
        ▼
Session starts
```

### What IS stored in the database (permanent)

| Table               | What it holds                                       | Why permanent                    |
|---------------------|-----------------------------------------------------|----------------------------------|
| `users`             | Accounts, XP, level, streak                         | Identity — never regenerate      |
| `topics`            | Subject / topic / subtopic taxonomy                 | The map Claude navigates         |
| `game_sessions`     | Session metadata (userId, topicId, score, XP)       | Needed for mastery calculation   |
| `question_attempts` | Per-question result (hash, correct, time, hint)     | Raw data for weakness detection  |
| `mastery_scores`    | Computed mastery per user per subtopic              | Drives study plans               |
| `tests`             | College test metadata and scores                    | Academic record                  |
| `test_questions`    | Per-question result (hash, subtopic, correct)       | Feeds weakness detection         |
| `study_plans`       | Weak topic assignments with priority                | Drives the remedial loop         |

### What is NOT stored (generated fresh, cached in Redis)

| What                    | Where it lives        | TTL       |
|-------------------------|-----------------------|-----------|
| Question text + options | Redis                 | 24 hours  |
| Correct answer          | Redis (never client)  | 24 hours  |
| Explanation text        | Redis                 | 24 hours  |
| Hint text               | Redis                 | 1 hour    |
| "Explain differently"   | Never cached          | Per-call  |
| Test question sets      | Redis (test session)  | 3 hours   |

---

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Frontend   | React + TypeScript + Tailwind CSS               |
| Backend    | Node.js + Express + TypeScript                  |
| Database   | PostgreSQL (via Prisma ORM)                     |
| Cache      | Redis — question cache + session state          |
| Auth       | JWT + bcrypt                                    |
| AI/LLM     | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Background | BullMQ (post-game mastery recalculation jobs)   |
| Hosting    | Railway or Render (simple first deploy)         |

---

## Database Schema

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
  subject   String   // e.g. "Quantitative Aptitude"
  topic     String   // e.g. "Number System"
  subtopic  String   // e.g. "Divisibility Rules" ← what Claude receives
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  gameSessions  GameSession[]
  masteryScores MasteryScore[]
  studyPlans    StudyPlan[]
}

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

// questionHash = sha256(questionText).slice(0,16) — deterministic, reproducible.
// NEVER stores the question text itself.
model QuestionAttempt {
  id           String      @id @default(uuid())
  sessionId    String
  session      GameSession @relation(fields: [sessionId], references: [id])
  questionHash String
  subtopic     String
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
  testType    String   // "aptitude" | "verbal" | "mixed"
  subject     String   // e.g. "Quantitative Aptitude" or "Mixed"
  totalMarks  Int
  scoredMarks Int
  timeLimitMin Int     @default(30)
  questionCount Int   @default(30)
  takenAt     DateTime @default(now())

  testQuestions TestQuestion[]
}

model TestQuestion {
  id           String  @id @default(uuid())
  testId       String
  test         Test    @relation(fields: [testId], references: [id])
  questionHash String
  subtopic     String  // critical — weakness detection reads this
  topicArea    String  // "aptitude" | "verbal"
  difficulty   Int
  isCorrect    Boolean
  marksAwarded Int     @default(0)
}

model StudyPlan {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  topicId     String
  topic       Topic     @relation(fields: [topicId], references: [id])
  priority    Priority  @default(MEDIUM)
  isCompleted Boolean   @default(false)
  dueDate     DateTime?
  createdAt   DateTime  @default(now())

  @@unique([userId, topicId])
}

enum Priority { HIGH  MEDIUM  LOW }
```

---

## Topic Taxonomy — Sourced from JV Global Services B2 Course Materials (60hr)

This is the **complete seed data** for the `topics` table. Claude generates questions for every subtopic on demand. Zero manual question authoring required.

### QUANTITATIVE APTITUDE

```typescript
// prisma/seed.ts — Quantitative Aptitude topics
const quantTopics = [
  // Number System
  { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'Divisibility Rules (3,4,6,7,8,9,11)' },
  { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'Trailing Zeros and Factorials' },
  { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'HCF and LCM' },
  { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'Unit Digit and Cyclicity' },
  { subject: 'Quantitative Aptitude', topic: 'Number System', subtopic: 'Factors — Total, Sum, Product, Odd' },

  // Averages
  { subject: 'Quantitative Aptitude', topic: 'Averages', subtopic: 'Simple Average and Average Speed' },
  { subject: 'Quantitative Aptitude', topic: 'Averages', subtopic: 'Weighted Average and Replacement Problems' },
  { subject: 'Quantitative Aptitude', topic: 'Averages', subtopic: 'Average Age Problems' },

  // Ratio and Proportion
  { subject: 'Quantitative Aptitude', topic: 'Ratio and Proportion', subtopic: 'Ratio Types and Proportion Rules' },
  { subject: 'Quantitative Aptitude', topic: 'Ratio and Proportion', subtopic: 'Compound and Continued Ratios' },
  { subject: 'Quantitative Aptitude', topic: 'Ratio and Proportion', subtopic: 'Alloys and Mixture Ratios' },

  // Percentage
  { subject: 'Quantitative Aptitude', topic: 'Percentage', subtopic: 'Percentage Increase and Decrease' },
  { subject: 'Quantitative Aptitude', topic: 'Percentage', subtopic: 'Population and Depreciation' },
  { subject: 'Quantitative Aptitude', topic: 'Percentage', subtopic: 'Percentage in Elections and Exams' },

  // Time, Speed and Distance
  { subject: 'Quantitative Aptitude', topic: 'Time Speed and Distance', subtopic: 'Basic Speed-Time-Distance' },
  { subject: 'Quantitative Aptitude', topic: 'Time Speed and Distance', subtopic: 'Problems on Trains' },
  { subject: 'Quantitative Aptitude', topic: 'Time Speed and Distance', subtopic: 'Boats and Streams' },
  { subject: 'Quantitative Aptitude', topic: 'Time Speed and Distance', subtopic: 'Problems on Races' },

  // Time and Work
  { subject: 'Quantitative Aptitude', topic: 'Time and Work', subtopic: 'Work Efficiency and Time' },
  { subject: 'Quantitative Aptitude', topic: 'Time and Work', subtopic: 'Pipes and Cisterns' },
  { subject: 'Quantitative Aptitude', topic: 'Time and Work', subtopic: 'Work with Variable Workers' },

  // Alligation and Mixture
  { subject: 'Quantitative Aptitude', topic: 'Alligation and Mixture', subtopic: 'Rule of Alligation and Mean Price' },
  { subject: 'Quantitative Aptitude', topic: 'Alligation and Mixture', subtopic: 'Repeated Replacement and Dilution' },

  // Partnership
  { subject: 'Quantitative Aptitude', topic: 'Partnership', subtopic: 'Simple and Compound Partnership' },
  { subject: 'Quantitative Aptitude', topic: 'Partnership', subtopic: 'Time-Weighted Investment Ratios' },

  // Profit and Loss
  { subject: 'Quantitative Aptitude', topic: 'Profit and Loss', subtopic: 'Cost Price, Selling Price, Profit Percent' },
  { subject: 'Quantitative Aptitude', topic: 'Profit and Loss', subtopic: 'Marked Price, Discount, Successive Discount' },
  { subject: 'Quantitative Aptitude', topic: 'Profit and Loss', subtopic: 'False Weights and Special Loss Problems' },

  // Simple and Compound Interest
  { subject: 'Quantitative Aptitude', topic: 'Simple and Compound Interest', subtopic: 'Simple Interest Formula and Applications' },
  { subject: 'Quantitative Aptitude', topic: 'Simple and Compound Interest', subtopic: 'Compound Interest — Annual, Half-yearly, Quarterly' },
  { subject: 'Quantitative Aptitude', topic: 'Simple and Compound Interest', subtopic: 'Difference between SI and CI' },

  // Problems on Ages
  { subject: 'Quantitative Aptitude', topic: 'Problems on Ages', subtopic: 'Age Equations and Ratio-based Age Problems' },
  { subject: 'Quantitative Aptitude', topic: 'Problems on Ages', subtopic: 'Average Age and Group Age Problems' },

  // Algebra
  { subject: 'Quantitative Aptitude', topic: 'Algebra', subtopic: 'Algebraic Formulae and Identities' },
  { subject: 'Quantitative Aptitude', topic: 'Algebra', subtopic: 'BODMAS, Logarithms and Surds' },
  { subject: 'Quantitative Aptitude', topic: 'Algebra', subtopic: 'Quadratic Equations and Roots' },

  // Set Theory
  { subject: 'Quantitative Aptitude', topic: 'Set Theory', subtopic: 'Union, Intersection and Venn Diagrams' },
  { subject: 'Quantitative Aptitude', topic: 'Set Theory', subtopic: 'De Morgan Laws and Set Problems' },

  // Permutation and Combination
  { subject: 'Quantitative Aptitude', topic: 'Permutation and Combination', subtopic: 'Permutations — with and without Repetition' },
  { subject: 'Quantitative Aptitude', topic: 'Permutation and Combination', subtopic: 'Combinations — Selection Problems' },
  { subject: 'Quantitative Aptitude', topic: 'Permutation and Combination', subtopic: 'Circular Arrangement and Word Formation' },

  // Probability
  { subject: 'Quantitative Aptitude', topic: 'Probability', subtopic: 'Basic Probability — Coins, Dice, Cards' },
  { subject: 'Quantitative Aptitude', topic: 'Probability', subtopic: 'Conditional Probability and Combined Events' },

  // Geometry and Mensuration
  { subject: 'Quantitative Aptitude', topic: 'Geometry and Mensuration', subtopic: '2D Figures — Area and Perimeter' },
  { subject: 'Quantitative Aptitude', topic: 'Geometry and Mensuration', subtopic: '3D Figures — Volume and Surface Area' },
  { subject: 'Quantitative Aptitude', topic: 'Geometry and Mensuration', subtopic: 'Triangle Properties and Quadrilateral Results' },

  // Data Interpretation
  { subject: 'Quantitative Aptitude', topic: 'Data Interpretation', subtopic: 'Table Chart Interpretation' },
  { subject: 'Quantitative Aptitude', topic: 'Data Interpretation', subtopic: 'Line Graph and Bar Chart Interpretation' },
  { subject: 'Quantitative Aptitude', topic: 'Data Interpretation', subtopic: 'Pie Chart and Data Sufficiency' },
];
```

### LOGICAL REASONING

```typescript
const logicalTopics = [
  // Number-based Reasoning
  { subject: 'Logical Reasoning', topic: 'Number Series', subtopic: 'Missing Number Series and Pattern Detection' },
  { subject: 'Logical Reasoning', topic: 'Number Analogy', subtopic: 'Number Relationship and Analogy Pairs' },
  { subject: 'Logical Reasoning', topic: 'Alphanumeric Problems', subtopic: 'Alphanumeric Sequence Analysis' },

  // Visual and Symbol Reasoning
  { subject: 'Logical Reasoning', topic: 'Letter and Symbol Series', subtopic: 'Letter Series and Symbol Patterns' },
  { subject: 'Logical Reasoning', topic: 'Coding and Decoding', subtopic: 'Letter Coding and Decoding' },
  { subject: 'Logical Reasoning', topic: 'Coding and Decoding', subtopic: 'Symbol and Number Coding' },

  // Spatial Reasoning
  { subject: 'Logical Reasoning', topic: 'Cubes and Dice', subtopic: 'Cube Painting and Cutting' },
  { subject: 'Logical Reasoning', topic: 'Cubes and Dice', subtopic: 'Dice Face Positions and Opposite Faces' },
  { subject: 'Logical Reasoning', topic: 'Visual Sequence', subtopic: 'Figure Pattern Completion and Mirror Images' },

  // Relational Reasoning
  { subject: 'Logical Reasoning', topic: 'Blood Relations', subtopic: 'Blood Relation Statement Problems' },
  { subject: 'Logical Reasoning', topic: 'Blood Relations', subtopic: 'Coded Blood Relation Diagrams' },
  { subject: 'Logical Reasoning', topic: 'Direction Sense', subtopic: 'Direction and Distance Problems' },
  { subject: 'Logical Reasoning', topic: 'Seating Arrangement', subtopic: 'Linear Seating Arrangement' },
  { subject: 'Logical Reasoning', topic: 'Seating Arrangement', subtopic: 'Circular and Square Table Arrangement' },

  // Deductive and Analytical Reasoning
  { subject: 'Logical Reasoning', topic: 'Syllogism', subtopic: 'Two and Three Statement Syllogism' },
  { subject: 'Logical Reasoning', topic: 'Deductive Reasoning', subtopic: 'Logical Deduction from Premises' },
  { subject: 'Logical Reasoning', topic: 'Statement and Assumptions', subtopic: 'Implicit Assumptions in Statements' },
  { subject: 'Logical Reasoning', topic: 'Statement and Arguments', subtopic: 'Strong vs Weak Arguments' },
  { subject: 'Logical Reasoning', topic: 'Statement and Conclusions', subtopic: 'Logical Conclusions from Statements' },
  { subject: 'Logical Reasoning', topic: 'Cause and Effect', subtopic: 'Cause-Effect Relationship between Statements' },
  { subject: 'Logical Reasoning', topic: 'Course of Action', subtopic: 'Appropriate Course of Action Problems' },

  // Special Topics
  { subject: 'Logical Reasoning', topic: 'Logical Reasoning Puzzles', subtopic: 'Constraint-based Logic Puzzles' },
  { subject: 'Logical Reasoning', topic: 'Binary Logic', subtopic: 'Truth Teller, Liar and Alternator Problems' },
  { subject: 'Logical Reasoning', topic: 'Cryptarithmetic', subtopic: 'Letter-to-Digit Substitution Puzzles' },
  { subject: 'Logical Reasoning', topic: 'Machine Input and Output', subtopic: 'Number and Word Rearrangement Machines' },
  { subject: 'Logical Reasoning', topic: 'Clocks', subtopic: 'Clock Angle, Time and Gain-Loss Problems' },
  { subject: 'Logical Reasoning', topic: 'Calendars', subtopic: 'Day of the Week and Calendar Calculations' },
  { subject: 'Logical Reasoning', topic: 'Flowchart', subtopic: 'Flowchart Tracing and Logic' },
];
```

### VERBAL ABILITY

```typescript
const verbalTopics = [
  // Reading Comprehension
  { subject: 'Verbal Ability', topic: 'Reading Comprehension', subtopic: 'Main Theme and Author Tone' },
  { subject: 'Verbal Ability', topic: 'Reading Comprehension', subtopic: 'Inference and Implicit Meaning' },
  { subject: 'Verbal Ability', topic: 'Reading Comprehension', subtopic: 'Error Spotting in Passage Sentences' },

  // Grammar
  { subject: 'Verbal Ability', topic: 'Grammar', subtopic: 'Sentence Correction and Error Spotting' },
  { subject: 'Verbal Ability', topic: 'Grammar', subtopic: 'Sentence Improvement with Phrasal Verbs' },
  { subject: 'Verbal Ability', topic: 'Grammar', subtopic: 'Sentence Completion with Correct Words' },
  { subject: 'Verbal Ability', topic: 'Grammar', subtopic: 'Identify the Correct Sentence' },

  // Vocabulary
  { subject: 'Verbal Ability', topic: 'Vocabulary', subtopic: 'Synonyms in Context' },
  { subject: 'Verbal Ability', topic: 'Vocabulary', subtopic: 'Antonyms in Context' },
  { subject: 'Verbal Ability', topic: 'Vocabulary', subtopic: 'One-Word Substitution' },
  { subject: 'Verbal Ability', topic: 'Vocabulary', subtopic: 'Fill in the Blank with Correct Word' },

  // Verbal Reasoning
  { subject: 'Verbal Ability', topic: 'Verbal Reasoning', subtopic: 'Verbal Analogy — Word Relationships' },
  { subject: 'Verbal Ability', topic: 'Verbal Reasoning', subtopic: 'Verbal Classification — Odd One Out' },
  { subject: 'Verbal Ability', topic: 'Verbal Reasoning', subtopic: 'Logical Sequence of Words' },

  // Sentence Arrangement
  { subject: 'Verbal Ability', topic: 'Sentence Arrangement', subtopic: 'Jumbled Sentence Rearrangement' },
  { subject: 'Verbal Ability', topic: 'Sentence Arrangement', subtopic: 'Para-jumbles — P Q R S Ordering' },

  // Idioms and Phrases
  { subject: 'Verbal Ability', topic: 'Idioms and Phrases', subtopic: 'Business and Common Idioms' },
];
```

---

## Test Portal — College Student Diagnostic Engine

This is the core differentiator of LearnHub. The test is designed to mirror competitive exam patterns (campus placement, AMCAT, TCS NQT, etc.).

### Test Configuration

The student can configure the test before starting:

```typescript
interface TestConfig {
  questionCount: 10 | 20 | 30 | 40 | 50;   // default: 30
  timeLimitMin:  10 | 20 | 30 | 45 | 60;   // default: 30 (1 min/question)
  testType: 'aptitude' | 'verbal' | 'mixed'; // default: 'mixed'
  difficulty: 1 | 2 | 3;                    // default: 2 (medium)
}
// mixed = ~50% quantitative aptitude + ~30% logical reasoning + ~20% verbal
// aptitude = quantitative aptitude + logical reasoning
// verbal = verbal ability only
```

### Test Question Distribution (for mixed 30Q test)

| Area                   | Questions | Topics Drawn From                              |
|------------------------|-----------|------------------------------------------------|
| Quantitative Aptitude  | 12        | Number System, Averages, Ratio, %, TSD, Time & Work, P&L, SI/CI, Ages, P&C, Probability |
| Logical Reasoning      | 10        | Series, Coding, Syllogism, Seating, Blood Relations, Clocks, Calendars, Statements |
| Verbal Ability         | 8         | RC, Grammar, Vocabulary, Verbal Analogy        |

For `aptitude` type: 18 QA + 12 LR. For `verbal` type: all 30 from verbal topics.

### Test Generation Service

```typescript
// services/testService.ts

export async function generateTest(
  userId: string,
  config: TestConfig
): Promise<{ testSessionKey: string; questions: ClientQuestion[] }> {

  const distribution = getDistribution(config);
  const allQuestions: GeneratedQuestion[] = [];

  for (const { topicIds, count } of distribution) {
    const topics = await db.topic.findMany({ where: { id: { in: topicIds } } });
    const perTopic = Math.ceil(count / topics.length);
    for (const topic of topics) {
      const qs = await getQuestions(topic.subtopic, config.difficulty, perTopic);
      allQuestions.push(...qs.slice(0, perTopic));
    }
  }

  // Shuffle and trim to exact count
  const shuffled = allQuestions.sort(() => Math.random() - 0.5).slice(0, config.questionCount);

  // Store full questions (with answers) in Redis — NEVER send answers to client
  const testSessionKey = `test:${userId}:${Date.now()}`;
  await redis.set(testSessionKey, JSON.stringify(shuffled), 'EX', config.timeLimitMin * 60 + 300);

  return {
    testSessionKey,
    questions: shuffled.map(q => ({
      hash: q.hash,
      questionText: q.questionText,
      options: q.options,
      difficulty: q.difficulty,
      subtopic: q.subtopic,
      topicArea: q.topicArea,
      // correctAnswer and explanation intentionally withheld
    })),
  };
}
```

### Test Prompt Engineering

Claude receives this system prompt when generating test questions for competitive exam preparation:

```typescript
function buildTestPrompt(subtopic: string, difficulty: 1|2|3, count: number, area: string): string {
  const diffLabel = ['easy', 'medium', 'hard'][difficulty - 1];
  const areaContext = {
    aptitude: `competitive exam quantitative aptitude (campus placement, AMCAT, TCS NQT style)`,
    verbal:   `competitive exam verbal ability (campus placement, AMCAT style)`,
    logical:  `competitive exam logical reasoning (campus placement style)`,
  }[area] || 'competitive exam';

  return `Generate ${count} ${diffLabel}-difficulty MCQs on "${subtopic}" for ${areaContext}.

Rules:
- Each question must have exactly 4 options (full text, not just A/B/C/D labels)
- correctAnswer must exactly match one of the options
- explanation: 2-3 sentences showing the step-by-step solution method
- Questions must be factually accurate and have exactly one correct answer
- For quantitative topics: include numerical calculation problems
- For verbal topics: include contextual usage, not just definitions
- For logical topics: include short puzzles requiring deduction
- Mix question types: direct formula application, word problems, tricky variants

Return ONLY valid JSON array, no markdown, no preamble:
[{
  "questionText": "...",
  "options": ["...", "...", "...", "..."],
  "correctAnswer": "...",
  "explanation": "...",
  "difficulty": ${difficulty},
  "subtopic": "${subtopic}",
  "topicArea": "${area}"
}]`;
}
```

### Test Submit Route

```typescript
// POST /tests/submit
router.post('/submit', auth, async (req, res) => {
  const { testSessionKey, answers, durationSec, config } = req.body;
  // answers: [{ hash, chosenAnswer, timeTakenMs }]

  const cached = await redis.get(testSessionKey);
  if (!cached) return res.status(400).json({ error: 'Test session expired or invalid' });

  const questions: GeneratedQuestion[] = JSON.parse(cached);
  const qMap = Object.fromEntries(questions.map(q => [q.hash, q]));

  let scoredMarks = 0;
  const testQuestions = answers.map((a: any) => {
    const q = qMap[a.hash];
    if (!q) return null;
    const isCorrect = q.correctAnswer === a.chosenAnswer;
    if (isCorrect) scoredMarks++;
    return {
      questionHash: q.hash,
      subtopic: q.subtopic,
      topicArea: q.topicArea,
      difficulty: q.difficulty,
      isCorrect,
      marksAwarded: isCorrect ? 1 : 0,
    };
  }).filter(Boolean);

  const test = await db.test.create({
    data: {
      userId: req.user.id,
      testType: config.testType,
      subject: config.testType,
      totalMarks: questions.length,
      scoredMarks,
      timeLimitMin: config.timeLimitMin,
      questionCount: questions.length,
      testQuestions: { create: testQuestions },
    },
  });

  // Trigger mastery recalculation for all affected subtopics
  const uniqueTopicIds = [...new Set(
    testQuestions.map((tq: any) =>
      // look up topicId by subtopic
      questions.find(q => q.subtopic === tq.subtopic)?.subtopic
    )
  )];
  for (const subtopic of uniqueTopicIds) {
    const topic = await db.topic.findFirst({ where: { subtopic } });
    if (topic) await masteryQueue.add('recalculate', { userId: req.user.id, topicId: topic.id });
  }

  // Now safe to reveal answers
  res.json({
    testId: test.id,
    scoredMarks,
    totalMarks: questions.length,
    percentage: Math.round((scoredMarks / questions.length) * 100),
    timeTaken: durationSec,
    results: answers.map((a: any) => {
      const q = qMap[a.hash];
      return {
        hash: a.hash,
        questionText: q.questionText,
        options: q.options,
        chosenAnswer: a.chosenAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect: q.correctAnswer === a.chosenAnswer,
        explanation: q.explanation,
        subtopic: q.subtopic,
        topicArea: q.topicArea,
      };
    }),
  });
});
```

---

## Test Analysis Dashboard

After test submission, the student sees a rich analytics dashboard. This is rendered at `GET /tests/:testId/analysis`.

### Dashboard Components

**1. Overall Score Card**
```
Score: 22/30 (73%) | Time: 28:14 | Difficulty: Medium
Percentile: ~82nd (estimate based on score distribution)
```

**2. Topic-wise Performance Breakdown**
```typescript
interface TopicBreakdown {
  topicArea: string;         // "Quantitative Aptitude"
  subtopic: string;          // "Number System"
  total: number;             // 3
  correct: number;           // 1
  accuracy: number;          // 33%
  avgTimeMs: number;         // 45000
  status: 'strong' | 'average' | 'weak'; // weak if accuracy < 60%
}
```

**3. Time Analysis**
- Average time per question
- Questions where student spent > 2x average time (flagged as "struggled here")
- Questions answered in < 10s (flagged as "guessed?")

**4. Weak Topic Summary**
- Automatically lists subtopics with < 60% accuracy
- Shows: subtopic name, questions attempted, accuracy, recommended study plan link
- Color coded: RED = < 40% (HIGH priority), ORANGE = 40–60% (MEDIUM priority)

**5. Strength Summary**
- Lists subtopics with ≥ 80% accuracy — positive reinforcement

**6. Question-by-Question Review**
- Each question shows: student's answer, correct answer, step-by-step explanation
- Grouped by topic area
- Wrong answers highlighted with explanation — the learning moment

### Analysis API

```typescript
// GET /tests/:testId/analysis
router.get('/:testId/analysis', auth, async (req, res) => {
  const test = await db.test.findUnique({
    where: { id: req.params.testId, userId: req.user.id },
    include: { testQuestions: true },
  });
  if (!test) return res.status(404).json({ error: 'Test not found' });

  // Group by subtopic
  const bySubtopic = groupBy(test.testQuestions, 'subtopic');
  const breakdown = Object.entries(bySubtopic).map(([subtopic, qs]) => ({
    subtopic,
    topicArea: qs[0].topicArea,
    total: qs.length,
    correct: qs.filter(q => q.isCorrect).length,
    accuracy: Math.round((qs.filter(q => q.isCorrect).length / qs.length) * 100),
    status: qs.filter(q => q.isCorrect).length / qs.length < 0.4
      ? 'weak' : qs.filter(q => q.isCorrect).length / qs.length < 0.6
      ? 'average' : 'strong',
  }));

  const weakSubtopics = breakdown.filter(b => b.status !== 'strong');
  const masteryScores = await db.masteryScore.findMany({
    where: { userId: req.user.id },
    include: { topic: true },
  });

  res.json({
    summary: {
      scoredMarks: test.scoredMarks,
      totalMarks: test.totalMarks,
      percentage: Math.round((test.scoredMarks / test.totalMarks) * 100),
      testType: test.testType,
      takenAt: test.takenAt,
    },
    breakdown,
    weakSubtopics,
    masteryScores,
    studyPlanNeeded: weakSubtopics.length > 0,
  });
});
```

---

## Weak Topic Remediation Flow

When a student is flagged as weak in a subtopic (mastery < 60%), the system takes the following actions:

### Step 1 — Auto-assign Study Plan
The BullMQ mastery job creates/updates a `StudyPlan` entry automatically. Priority:
- `HIGH` if mastery < 40% (student got < 40% correct)
- `MEDIUM` if mastery 40–60%

### Step 2 — Remedial Game Session
On the Study Plan dashboard, each weak topic has a **"Practice Now"** button that:
1. Starts a game session on that specific subtopic at difficulty 1 (easy)
2. Tells Claude: *"Focus on building foundational understanding. Use simple, direct questions that teach the concept clearly."*
3. After the game, re-runs mastery calculation

### Step 3 — AI-Powered Concept Explanation
When a student clicks **"Explain This Topic"** on a weak subtopic, the system calls Claude with:

```typescript
async function explainWeakTopic(subtopic: string, studentAccuracy: number): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    stream: true,
    messages: [{
      role: 'user',
      content: `A student scored only ${studentAccuracy}% on questions about "${subtopic}".

Please provide:
1. A clear, simple explanation of the core concept in 2-3 paragraphs
2. The key formula or rule to remember (if applicable)
3. A worked example showing step-by-step solution
4. One common mistake students make and how to avoid it

Keep the language encouraging and accessible to a college student.`,
    }],
  });
  return msg; // SSE streamed to client
}
```

### Step 4 — Practice Problems
After the explanation, the student gets **5 fresh practice problems** generated specifically for that weak subtopic:

```typescript
async function getRemedialProblems(subtopic: string): Promise<GeneratedQuestion[]> {
  // Uses difficulty=1, count=5, with a special remedial prompt
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `Generate 5 easy MCQs about "${subtopic}" for a student who is struggling with this topic.

Rules:
- Start with the simplest possible version of each concept
- Each question should teach one clear thing
- Explanations must be detailed (3-4 sentences) showing the complete method
- Include at least 1 formula-based, 1 conceptual, and 1 word problem
- Return ONLY valid JSON:
[{ "questionText":"...","options":["...","...","...","..."],"correctAnswer":"...","explanation":"...","difficulty":1,"subtopic":"${subtopic}" }]`,
    }],
  });
  // parse and return
}
```

### Step 5 — Retest / Track Progress
- Dashboard shows mastery score history as a sparkline chart
- "Retake Section" button runs a mini 10-question test on weak subtopics only
- When mastery crosses 60%, the study plan item is marked complete and student earns +150 XP ("Weak Topic Mastered" badge)

---

## Test UI/UX Specification

### Test Setup Screen (`/test/setup`)
```
┌─────────────────────────────────────┐
│  Configure Your Diagnostic Test     │
│                                     │
│  Test Type:  [Aptitude] [Verbal] [Mixed] │
│  Questions:  [10] [20] [30] [40] [50]  │
│  Time Limit: [10m] [20m] [30m] [45m] [60m] │
│  Difficulty: [Easy] [Medium] [Hard]  │
│                                     │
│  Recommended: 30 Questions / 30 min │
│  (1 minute per question)            │
│                                     │
│  [Start Test]                       │
└─────────────────────────────────────┘
```

### Test Portal Screen (`/test/portal`)
```
┌─────────────────────────────────────┐
│  Q 14 / 30    ⏱ 16:42 remaining    │
│  Quantitative Aptitude > Ratio      │
│                                     │
│  If A:B = 2:5 and B:C = 4:3,       │
│  find A:B:C.                        │
│                                     │
│  ○ 8:20:15                          │
│  ○ 8:20:12  ← student selected     │
│  ○ 10:25:15                         │
│  ○ 2:5:3                            │
│                                     │
│  [← Prev]  [Flag] [Skip] [Next →]  │
│                                     │
│  Progress: ■■■■■■■■■■■■■□□□□□□□    │
└─────────────────────────────────────┘
```

**Key UX rules:**
- Timer counts down, turns red at < 5 minutes
- Student can flag questions and return to them
- Auto-submit when timer reaches 0
- No ability to go back after submission
- Answers stored client-side in React state until submit (not persisted mid-test)

### Analysis Dashboard Screen (`/test/:id/analysis`)
Full breakdown as described in "Test Analysis Dashboard" section above. Key UI elements:
- Donut chart: correct vs incorrect vs skipped
- Horizontal bar chart: accuracy per subtopic (color-coded)
- Accordion: question-by-question review with explanation
- CTA card: "Your weak areas — Start remedial practice now"

---

## Question Generation Service

```typescript
// services/questionService.ts
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { redis } from '../lib/redis';

const client = new Anthropic();

export interface GeneratedQuestion {
  hash: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: 1 | 2 | 3;
  subtopic: string;
  topicArea?: string;
}

const CACHE_TTL = 60 * 60 * 24; // 24 hours

function cacheKey(subtopic: string, difficulty: number, count: number): string {
  const norm = subtopic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
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
- explanation: 2-3 sentences showing step-by-step solution
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
  const norm = subtopic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const keys = await redis.keys(`q:${norm}:*`);
  if (keys.length) await redis.del(...keys);
}
```

---

## Weakness Detection Algorithm

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
  // Pull attempts from both game sessions AND tests
  const gameAttempts = await db.questionAttempt.findMany({
    where: { session: { userId, topicId } },
    orderBy: { session: { playedAt: 'asc' } },
    select: { isCorrect: true, difficulty: true },
  });

  const topic = await db.topic.findUnique({ where: { id: topicId } });
  const testAttempts = topic ? await db.testQuestion.findMany({
    where: { test: { userId }, subtopic: topic.subtopic },
    orderBy: { test: { takenAt: 'asc' } },
    select: { isCorrect: true, difficulty: true },
  }) : [];

  const allAttempts = [...gameAttempts, ...testAttempts];
  const score = computeMastery(allAttempts);
  const { isWeak, priority } = classifyTopic(score);
  const due = new Date();
  due.setDate(due.getDate() + 3);

  await db.masteryScore.upsert({
    where:  { userId_topicId: { userId, topicId } },
    update: { score, isWeak, attemptCount: allAttempts.length, lastUpdated: new Date() },
    create: { userId, topicId, score, isWeak, attemptCount: allAttempts.length },
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

## Hint and Explanation Services

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

// services/explanationService.ts — Never cached, always personalised
export async function getPersonalisedExplanation(
  questionText: string,
  correctAnswer: string,
  studentAnswer: string
): Promise<AsyncIterable<any>> {
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `A student answered "${studentAnswer}" to: "${questionText}"
Correct answer: "${correctAnswer}"
In 2-3 encouraging sentences, explain why their answer was wrong and show the correct reasoning step-by-step.`,
    }],
  });
  return stream; // caller handles SSE streaming to client
}
```

---

## XP System

```typescript
export const XP_RULES = {
  correct_easy:         10,
  correct_medium:       18,
  correct_hard:         25,
  speed_bonus:           5,   // < 5s correct answer
  daily_streak_7:      100,
  topic_completed:      50,
  weak_topic_mastered: 150,
  perfect_test:        200,   // 100% on any test
  hint_used:            -5,   // deducted
};

const LEVEL_THRESHOLDS = [0, 500, 1200, 2000, 3200, 5000, 8000, 12000, 18000];
// Levels: Rookie → Explorer → Apprentice → Scholar → Expert → Master → Champion → Legend → Grandmaster
```

---

## API Routes

```
# Auth
POST   /auth/register
POST   /auth/login

# Topics
GET    /topics/search?q=&subject=
GET    /topics/:id
GET    /topics/:id/summary          ← AI 3-bullet primer (Redis 7d TTL)

# Games (school + college)
GET    /games/session/:topicId?difficulty=   ← returns questions WITHOUT answers
POST   /games/session/submit                 ← validate server-side, save hashes
POST   /games/hint                           ← { questionHash, questionText }
POST   /games/explain                        ← { questionText, correctAnswer, studentAnswer } → SSE stream

# Tests (college only — requires COLLEGE_STUDENT role)
GET    /tests/setup                          ← returns available topic counts per area
POST   /tests/generate                       ← { testType, questionCount, timeLimitMin, difficulty }
POST   /tests/submit                         ← validate, store hashes, trigger mastery jobs
GET    /tests/:testId/analysis               ← full analysis dashboard data
GET    /tests/history                        ← user's past tests

# Remediation
GET    /study-plan                           ← ordered by priority + due date
GET    /study-plan/:topicId/explain          ← SSE streamed topic explanation
GET    /study-plan/:topicId/problems         ← 5 fresh remedial questions
POST   /study-plan/:topicId/complete         ← mark as done

# Dashboard and Progress
GET    /dashboard                            ← stats, weak topics, study plan, recent tests
GET    /mastery                              ← full mastery scores for user
GET    /leaderboard?subject=&period=
```

---

## Folder Structure

```
/
├── client/src/
│   ├── pages/
│   │   ├── Auth.tsx
│   │   ├── Dashboard.tsx
│   │   ├── GameSession.tsx
│   │   ├── TestSetup.tsx          ← NEW: configure test params
│   │   ├── TestPortal.tsx         ← NEW: timed test interface
│   │   ├── TestAnalysis.tsx       ← NEW: full analysis dashboard
│   │   ├── StudyPlan.tsx          ← remedial queue
│   │   ├── TopicExplainer.tsx     ← NEW: streamed concept explanation
│   │   ├── Leaderboard.tsx
│   │   └── Profile.tsx
│   ├── components/
│   │   ├── QuestionCard.tsx
│   │   ├── TestTimer.tsx          ← NEW: countdown with urgency states
│   │   ├── SubtopicBreakdown.tsx  ← NEW: bar chart of accuracy per subtopic
│   │   ├── WeakTopicCard.tsx      ← NEW: weak topic + CTA to remediate
│   │   ├── XPBar.tsx
│   │   ├── MasteryChart.tsx
│   │   └── GameTimer.tsx
│   └── services/api.ts
│
├── server/src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── topics.ts
│   │   ├── games.ts
│   │   ├── tests.ts               ← NEW: test portal routes
│   │   ├── studyPlan.ts           ← NEW: remediation routes
│   │   └── dashboard.ts
│   ├── services/
│   │   ├── questionService.ts
│   │   ├── testService.ts         ← NEW: test generation and distribution
│   │   ├── hintService.ts
│   │   ├── explanationService.ts
│   │   ├── weaknessDetector.ts
│   │   └── xpService.ts
│   ├── jobs/
│   │   └── masteryJob.ts
│   ├── lib/
│   │   └── redis.ts
│   └── middleware/
│       └── auth.ts
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                    ← topic taxonomy ONLY (all topics above)
│
└── CLAUDE.md
```

---

## Redis Key Schema

| Key pattern                           | Content                             | TTL      |
|---------------------------------------|-------------------------------------|----------|
| `q:{subtopic}:{difficulty}:{count}`   | JSON array of GeneratedQuestion     | 24 hours |
| `session:{userId}:{timestamp}`        | JSON array of GeneratedQuestion     | 1 hour   |
| `test:{userId}:{timestamp}`           | JSON array of GeneratedQuestion     | 3 hours  |
| `hint:{questionHash}`                 | Hint string                         | 1 hour   |
| `summary:{topicId}`                   | 3-bullet summary string             | 7 days   |
| `session:{sessionId}:state`           | Adaptive difficulty state JSON      | 1 hour   |
| `remedial:{subtopic}:{userId}`        | 5 remedial questions JSON           | 6 hours  |

---

## Environment Variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/learndb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret_here
ANTHROPIC_API_KEY=your_anthropic_key_here
PORT=4000

VITE_API_URL=http://localhost:4000
```

---

## Phase-by-Phase Build Plan

### Phase 1 — Core Prototype (Weeks 1–4)

**Goal:** End-to-end loop — student searches topic, plays Claude-generated game, earns XP.

1. Project setup — monorepo, PostgreSQL + Redis local, `prisma migrate dev`, `.env` with all keys
2. Auth — register/login, JWT middleware, role-based access
3. Topic taxonomy — seed ALL topics from this file, `GET /topics/search?q=`
4. Game session — implement `questionService.ts`, session route (no answers to client), submit route
5. XP + profile page

**Acceptance criteria:**
- [ ] Questions generated by Claude, cached in Redis — never in PostgreSQL
- [ ] Correct answers never sent to client before submit
- [ ] `question_attempts` stores only `questionHash`, not question text
- [ ] XP awarded and reflected on profile

---

### Phase 2 — Gamification Layer (Weeks 5–7)

**Goal:** Make it feel like a game, not a quiz tool.

1. Streaks — `lastActiveAt` tracking, milestone XP bonuses
2. Level system — `LEVEL_THRESHOLDS`, level-up toast, title display
3. Leaderboard — top 10 + current user rank
4. Badges — first game / 7-day streak / first mastered / perfect score
5. Adaptive difficulty — 3 correct → difficulty+1, 2 wrong → difficulty-1

**Acceptance criteria:**
- [ ] Streaks work correctly across day boundaries
- [ ] Adaptive difficulty shifts mid-session
- [ ] 3 badge types working end-to-end

---

### Phase 3 — College Test + Weakness Detection (Weeks 8–11)

**Goal:** The diagnostic engine — the platform's core differentiator.

1. **Test Setup screen** — student configures test type, question count, time limit
2. **Test generation** — `POST /tests/generate`, balanced distribution across subtopics
3. **Test Portal UI** — timed interface with question navigation, flag, auto-submit
4. **Test submission** — server-side validation, store `TestQuestion` rows
5. **Analysis Dashboard** — `GET /tests/:testId/analysis`, topic breakdown, weak areas
6. **Weakness detection job** — BullMQ fires after every test submit, runs `recalculateMastery`
7. **Study Plan queue** — weak topics auto-assigned with priority badges
8. **Remedial game** — "Practice Now" button starts easy game on weak subtopic
9. **Topic Explainer** — streamed explanation for weak subtopic
10. **Practice Problems** — 5 fresh remedial questions after explanation
11. Educator analytics — per-subtopic accuracy across class

**Acceptance criteria:**
- [ ] Test respects configured question count and time limit
- [ ] Timer auto-submits at 0
- [ ] Analysis dashboard shows per-subtopic accuracy correctly
- [ ] Study plan auto-populates with correct priority after test
- [ ] Remedial explanation streams correctly via SSE
- [ ] Weak-topic-mastered XP (150) fires when mastery threshold crossed

---

### Phase 4 — AI Content Layer (Weeks 12–14)

**Goal:** Make wrong answers a learning moment.

1. Hint system — `POST /games/hint`, Redis 1h TTL, -5 XP deduction
2. Personalised explanation — `POST /games/explain`, never cached, SSE stream
3. Topic summary card — `GET /topics/:id/summary`, Redis 7d TTL
4. Concept explainer mode — pre-game streaming explanation

**Acceptance criteria:**
- [ ] Hints < 500ms on cache hit, < 3s on miss
- [ ] "Explain differently" is specific to student's wrong answer
- [ ] Topic summary loads before game starts

---

### Phase 5 — Social and Spaced Repetition (Weeks 15–20)

**Goal:** Long-term retention and competitive engagement.

1. Spaced repetition — `nextReviewAt` on `MasteryScore`, due-today dashboard section
2. Peer battle — async 1v1, same Redis cache key = identical question set, winner +50 XP
3. Question quality flags — 3 flags → `invalidateCache` → Claude regenerates
4. Personalised difficulty calibration — `recommendedDifficulty(userId, topicId)` on session start
5. PDF progress report — Puppeteer, per-subject mastery heatmap, downloadable

**Acceptance criteria:**
- [ ] Spaced repetition due dates correct across all score scenarios
- [ ] Peer battle completes full async cycle
- [ ] 3 flags invalidate cache, Claude regenerates on next request
- [ ] PDF report generates correctly

---

## Further Improvements (NOT in scope for this build)

The following two features are planned for a future version. They are documented here so the architecture can accommodate them without major refactoring.

### 1. Coding-Based Questions

**Concept:** Instead of MCQs, present a coding problem (pseudocode or actual code) and ask students to identify output, detect bugs, or write a code snippet.

**Architecture notes (when implemented):**
- Add `questionFormat: 'mcq' | 'code' | 'fill_code'` field to `GeneratedQuestion`
- Code questions use a Monaco editor on the frontend
- For "predict output" questions, Claude provides the code + options
- For "write code" questions, the backend runs student code in a sandboxed Docker container (e.g., Judge0 API)
- Results stored with same `questionHash` pattern
- Topics to add: Arrays, Strings, Recursion, Sorting, OOP concepts, SQL queries

**Why deferred:** Requires sandboxed code execution infrastructure (Judge0/Piston API), Docker setup, and careful security review. Not appropriate for v1.

### 2. Virtual Interview

**Concept:** An AI-powered mock interview where Claude plays the interviewer, asks HR and technical questions, evaluates responses in real-time, and gives feedback at the end.

**Architecture notes (when implemented):**
- New `interviews` table: `{ userId, type: 'hr'|'technical'|'mixed', transcript: JSONB, score, feedback }`
- Conversational Claude prompt with system role: "You are a senior interviewer at a top tech company..."
- Real-time back-and-forth via SSE or WebSocket
- At the end, Claude evaluates: communication clarity, technical accuracy, confidence markers in text
- Generates a downloadable PDF interview report
- Topics: Tell me about yourself, Strengths/Weaknesses, Project discussions, STAR method answers, Behavioural questions, CS fundamentals

**Why deferred:** Requires WebSocket infrastructure, evaluation rubric design, and significant prompt engineering to make Claude a reliable evaluator. Not appropriate for v1.

---

## Key Invariants — Never Break These

1. **Questions are NEVER stored in PostgreSQL.** `question_attempts` and `test_questions` store only `questionHash` + metadata.
2. **Correct answers are NEVER sent to the client** before submit. They live in Redis under server-side session/test keys only.
3. **All answer validation happens server-side.** The submit route retrieves questions from Redis and checks answers there.
4. **`mastery_scores` is always computed from raw `question_attempts` + `test_questions`.** Never manually set from a route handler.
5. **`study_plans` are only created/updated by the BullMQ background job.** Never write to `study_plans` directly from a route.
6. **Cache keys must include difficulty and count** so a difficulty-1 cache hit is never served to a difficulty-3 request.
7. **After 3 question flags on the same hash, call `invalidateCache` immediately.** Claude regenerates fresh questions on next request.
8. **Test timer enforcement is server-side.** The server records `test_start_time` in Redis. On submit, if `now - start > timeLimitMin * 60 + 30s`, reject with 400.
9. **Weakness detection runs after BOTH game sessions AND tests.** Both feed into the same `recalculateMastery` function.
10. **Study plan remedial games use difficulty=1** regardless of the student's current adaptive level.

---

## Definition of Done (Per Phase)

A phase is complete when:
- All acceptance criteria checkboxes are passing
- `tsc --noEmit` passes with zero errors
- No `questions` or `question_content` table exists in PostgreSQL
- Redis cache hit rate > 60% after 10 sessions on any single subtopic
- Weakness detector produces correct classifications in `__tests__/weaknessDetector.test.ts`
- Test portal submits correctly and analysis dashboard renders accurate data