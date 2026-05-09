# LearnHub — Domain-Based Game Arcade + Interview Prep Platform

## Overview
LearnHub is a **gamified learning platform** that combines domain-driven progressive learning with interactive mini-games, AI-generated content, and a comprehensive **Interview Preparation module**. Users learn through 7 game types, earn XP, rank up, unlock achievements, and prepare for job interviews/placements. The Interview Prep module uses **static question banks** from JSON files plus AI-generated theory notes.

## Tech Stack
- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Express + TypeScript + Prisma ORM
- **Database**: PostgreSQL (learndb)
- **Cache**: Redis (port 6379)
- **LLM**: Groq (Llama 3.3 70B) for learning domain content
- **Auth**: JWT

---

## ✅ COMPLETED — Current State (unchanged, see previous sessions)

All existing features intact:
- 8 Learning Domains, 35 Topics, 7 Game Engines, AI Tutorials, Quick Notes
- Achievement System, Rank Progression, Level Advancement
- Domain Search + Custom AI Domain Generation
- State Persistence, JWT Auth

---

## 🔧 SESSION 3 — Interview Preparation Module (JSON-Driven)

### Design Philosophy — STATIC DATA, NOT LLM

Unlike the learning domains (which use Groq to generate questions on-the-fly), the Interview Prep module uses **pre-existing JSON question banks**. This is more reliable for aptitude/placement exams because the questions are curated and have fixed answer formats.

### Source Data Files

**1. `aptitude_book_470_solved.json`** — 470 questions WITH correct answers
- Source: `c:\Users\Lenovo\Downloads\aptitude_book_470_solved (1).json`
- Copy to: `server/prisma/data/aptitude_questions.json`
- Structure per question:
```json
{
  "id": 1,
  "section": "A",                          // A=Quant, B=LogicalReasoning, C=Verbal
  "category": "Quantitative Aptitude",     // 3 categories
  "round": "quantitative-aptitude",        // slug
  "topic": "Number System",               // sub-topic within category
  "block_type": "problems",
  "question_number": 10,
  "question": "What is the rightmost integer...",
  "option_a": "3",
  "option_b": "5",
  "option_c": "7",
  "option_d": "9",
  "option_e": "",
  "correct_answer": "B",                  // ✅ FILLED — letter of correct option
  "needs_answer": false,                   // ✅ false — answer is provided
  "difficulty": "medium",
  "source": "The Aptitude Triad",
  "correct_index": 1                       // ✅ 0-indexed position of correct option
}
```

**Answers are pre-filled** — no LLM solving needed at seed time. The `correct_answer` field contains the option letter (A/B/C/D) and `correct_index` contains the 0-based index. During quiz grading, simply compare the user's chosen index against `correct_index`.

**3 Categories found in questions:**
| Section | Category | Round Slug | Topics Found |
|---------|----------|------------|-------------|
| A | Quantitative Aptitude | quantitative-aptitude | Number System, HCF LCM and Decimal Fractions, Percentages, Profit Loss and Discounts, Simple and Compound Interest, Averages, Alligations and Mixtures, Ratios Proportions and Variations, etc. |
| B | Logical Reasoning | logical-reasoning | Clocks, Calendars, Cubes and Dice, Seating Arrangements, Blood Relations, etc. |
| C | Verbal Ability | verbal-ability | Sentence Completion, Reading Comprehension, Para Jumbles, Critical Reasoning, etc. |

**2. `topic_theory_notes.json`** — 61 theory entries
- Copy to: `server/prisma/data/topic_theory.json`
- Structure per entry:
```json
{
  "id": 1,
  "topic": "Number System",
  "category": "Quantitative Aptitude",
  "round": "quantitative-aptitude",
  "raw_theory": "NUMBER SYSTEM\nTYPES OF NUMBERS...",  // full text
  "quick_notes": {
    "keyPoints": ["Natural Numbers: ...", ...],
    "formulas": ["Tn = a(n-1)d", ...],
    "funFact": "",
    "gameTypeHint": ""
  },
  "tutorial_sections": [
    { "heading": "Introduction", "content": "..." },
    { "heading": "Key Concepts", "content": ["...", "..."] },
    { "heading": "Important Formulas", "content": ["...", "..."] },
    { "heading": "Solved Examples", "content": ["...", "..."] }
  ],
  "formula_count": 15,
  "example_count": 1,
  "concept_count": 15
}
```

---

### Feature D: Database Schema Changes

**[MODIFY] `server/prisma/schema.prisma`**

Add new models for interview prep. Keep them SEPARATE from the learning Domain/Topic tables:

```prisma
// ===== INTERVIEW PREP MODELS =====

model InterviewCategory {
  id          String   @id @default(uuid())
  section     String   // "A", "B", "C"
  name        String   // "Quantitative Aptitude", "Logical Reasoning", "Verbal Ability"
  slug        String   @unique // "quantitative-aptitude", "logical-reasoning", "verbal-ability"
  icon        String   // emoji
  description String
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())

  topics    InterviewTopic[]
}

model InterviewTopic {
  id          String   @id @default(uuid())
  name        String   // "Number System", "Percentages", "Calendars", etc.
  slug        String   // "number-system"
  categoryId  String
  category    InterviewCategory @relation(fields: [categoryId], references: [id])
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())

  questions   InterviewQuestion[]
  theory      InterviewTheory?
  progress    UserInterviewProgress[]

  @@unique([categoryId, slug])
}

model InterviewQuestion {
  id              String   @id @default(uuid())
  topicId         String
  topic           InterviewTopic @relation(fields: [topicId], references: [id])
  questionNumber  Int
  question        String
  optionA         String
  optionB         String
  optionC         String
  optionD         String
  optionE         String?
  correctAnswer   String   // "A", "B", "C", "D" — from solved JSON
  correctIndex    Int      // 0-indexed — from solved JSON
  difficulty      String   @default("medium") // easy, medium, hard
  sourceRef       String?  // "The Aptitude Triad"
  createdAt       DateTime @default(now())
}

model InterviewTheory {
  id              String   @id @default(uuid())
  topicId         String   @unique
  topic           InterviewTopic @relation(fields: [topicId], references: [id])
  rawTheory       String   // full theory text from JSON
  keyPoints       Json     // string[] from quick_notes.keyPoints
  formulas        Json     // string[] from quick_notes.formulas
  tutorialSections Json    // [{heading, content}] from tutorial_sections
  formulaCount    Int      @default(0)
  exampleCount    Int      @default(0)
  conceptCount    Int      @default(0)
}

model UserInterviewProgress {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  topicId     String
  topic       InterviewTopic @relation(fields: [topicId], references: [id])
  gamesPlayed Int      @default(0)
  bestScore   Int      @default(0)
  avgScore    Float    @default(0)
  totalXp     Int      @default(0)
  lastPlayedAt DateTime?

  @@unique([userId, topicId])
}
```

Also add relation to User model:
```prisma
model User {
  // ... existing fields ...
  interviewProgress UserInterviewProgress[]
}
```

---

### Feature E: Seeding from JSON Files

**[NEW] `server/prisma/data/` directory** — copy the 2 JSON files here:
- `aptitude_questions.json` ← from `aptitude_book_470_solved (1).json`
- `topic_theory.json` ← from `topic_theory_notes.json`

**[MODIFY] `server/prisma/seed.ts`** — add interview data seeding

The seed script will:
1. Read `aptitude_questions.json` and `topic_theory.json`
2. Extract unique categories → create `InterviewCategory` rows (3 total)
3. Extract unique topics per category → create `InterviewTopic` rows (~33 total)
4. For each question → create `InterviewQuestion` row
   - `correctAnswer` and `correctIndex` are read directly from the JSON — no LLM needed
   - Map `correct_answer: "B"` → `correctAnswer: "B"` and `correct_index: 1` → `correctIndex: 1`
5. For each theory entry → create `InterviewTheory` row linked to its topic

---

### Feature F: Backend Services & Routes

**[NEW] `server/src/services/interviewService.ts`**

```typescript
// Functions:

getInterviewCategories()
// Returns all 3 categories with topic counts + user progress summary

getCategoryTopics(categorySlug, userId)
// Returns all topics in a category with user's best score, games played

getTopicQuestions(topicId, count=10)
// Fetches `count` random questions from InterviewQuestion for this topic
// Returns questions with options (NOT the correct answer until submission)

getTopicTheory(topicId)
// Returns InterviewTheory data (key points, formulas, tutorial sections)

getTopicQuickNotes(topicId)
// Returns the quick_notes (keyPoints + formulas) from InterviewTheory
// This replaces the LLM-based getQuickNotes for interview mode

submitInterviewQuiz(userId, topicId, answers[])
// Input: array of { questionId, chosenOption }
// For each question: look up correct_answer from DB, check if match
// Calculate score, update UserInterviewProgress
// Return { score, results[], xpEarned, solutions[] }
//   where results = [{ questionId, isCorrect, correctAnswer, solution, hint }]

getInterviewStats(userId)
// Returns: per-category avg scores, total XP, weakest topics, games played
```

**[NEW] `server/src/routes/interview.ts`**

```
GET    /interview/categories                       → getInterviewCategories()
GET    /interview/categories/:slug                 → getCategoryTopics(slug, userId)
GET    /interview/topics/:topicId/questions         → getTopicQuestions(topicId, count)
GET    /interview/topics/:topicId/theory            → getTopicTheory(topicId)
GET    /interview/topics/:topicId/quick-notes       → getTopicQuickNotes(topicId)
POST   /interview/submit                           → submitInterviewQuiz(userId, topicId, answers)
GET    /interview/stats                            → getInterviewStats(userId)
```

**[MODIFY] `server/src/index.ts`**
```typescript
import interviewRoutes from './routes/interview';
app.use('/interview', interviewRoutes);
```

---

### Feature G: Frontend Pages

**[MODIFY] `client/src/pages/Dashboard.tsx`**
- Add prominent **"🎯 Interview Prep"** button alongside "🚀 Learning Domains"

**[NEW] `client/src/pages/InterviewHub.tsx`**
Main interview landing page:
- Header: "Interview Preparation" with overall stats
- **3 Category Cards** (Quantitative Aptitude 🔢, Logical Reasoning 🧩, Verbal Ability 📝)
  - Each shows: topic count, progress bar, avg score
- Click a category → navigates to InterviewCategory page

**[NEW] `client/src/pages/InterviewCategory.tsx`**
Topic grid for a specific category (e.g., Quantitative Aptitude):
- Header with category name + icon + description
- **Topic Cards Grid** — each shows:
  - Topic name (e.g., "Number System", "Percentages")
  - Question count badge
  - Best score + games played
  - Two buttons:
    - **📖 Study Notes** → opens theory/notes view for this topic
    - **🎮 Practice Quiz** → opens quiz (MCQ game) for this topic
- Sorting: alphabetical, by score (weakest first), by question count

**[NEW] `client/src/pages/InterviewTheory.tsx`**
Theory/study notes page for a specific topic:
- Renders the `tutorial_sections` from the JSON data:
  - Introduction
  - Key Concepts (bullet points)
  - Important Formulas (highlighted in formula boxes)
  - Solved Examples (step-by-step)
  - Tips and Shortcuts
- Bottom: "Ready to Practice?" button → navigates to quiz

**[NEW] `client/src/pages/InterviewQuiz.tsx`**
Quiz page for a specific interview topic:
- **Pre-quiz**: QuickNotes modal (from InterviewTheory.keyPoints + formulas)
  - Uses the STATIC data from DB, NOT LLM
- **Quiz flow**: 10 random questions from the topic
  - Shows question + 4 options
  - Timer per question (optional: 60 seconds)
  - After answering: immediately show if correct/incorrect + solution + hint
  - "Next Question" button
- **Post-quiz scorecard**:
  - Score percentage
  - XP earned
  - Per-question review (correct answer, solution, your answer)
  - "📖 Review Theory" and "🔄 Retry" buttons

**[MODIFY] `client/src/App.tsx`**
Add new page states and routing:
```
interview-hub → InterviewHub
interview-category → InterviewCategory (with selectedCategorySlug)
interview-theory → InterviewTheory (with selectedInterviewTopicId)
interview-quiz → InterviewQuiz (with selectedInterviewTopicId)
```

---

### How the 7 Games Fit In (Phase 2 — Future Enhancement)

For Phase 1, the interview module uses a **dedicated quiz component** (`InterviewQuiz.tsx`) that directly fetches questions from the DB. This is simpler and more reliable than routing through the existing game engines.

In a future phase, the other 6 games can be adapted for interview prep theory learning:
- **Memory Match**: Match formulas to their names (from InterviewTheory.formulas)
- **Word Scramble**: Scramble key terms from theory (e.g., "PERCENTAGE", "COMPOUND INTEREST")
- **Fill-the-Blank**: Formulas with blanks (e.g., "SI = P × R × __ / 100")
- **Hangman**: Key terms from the topic
- **Crossword**: Terms + clue pairs from key concepts
- **Concept Cannon**: True/false statements from theory

These would use the `InterviewTheory` data (not LLM) to generate game content.

---

## Implementation Order

```
Phase 1 — Data Setup (30 min)
  1. Copy JSON files to server/prisma/data/
  2. Add InterviewCategory, InterviewTopic, InterviewQuestion, InterviewTheory,
     UserInterviewProgress models to schema.prisma
  3. Run migration: npx prisma migrate dev --name interview_prep
  4. Write seed logic to read JSONs and populate DB
  5. Run seed: npx prisma db seed

Phase 2 — Backend (1-2 hours)
  6. Create interviewService.ts with all core functions
  7. Create interview.ts routes
  8. Register routes in index.ts
  9. Test with curl/browser

Phase 3 — Frontend (2-3 hours)
  10. Add "Interview Prep" button to Dashboard
  11. Build InterviewHub.tsx (3 category cards)
  12. Build InterviewCategory.tsx (topic grid)
  13. Build InterviewTheory.tsx (study notes)
  14. Build InterviewQuiz.tsx (MCQ quiz with solutions)
  15. Add routes to App.tsx

Phase 4 — Polish (30 min)
  16. Add interview-specific achievements
  17. Test full flow: Hub → Category → Topic → Theory → Quiz → Score
```

---

## Files Changed/Created Summary

### Modified (5 files)
| File | Change |
|------|--------|
| `server/prisma/schema.prisma` | Add 5 new interview models + User relation |
| `server/prisma/seed.ts` | Add interview seeding from JSON files |
| `server/src/index.ts` | Register `/interview` routes |
| `client/src/pages/Dashboard.tsx` | Add "🎯 Interview Prep" button |
| `client/src/App.tsx` | Add interview page states + routing |

### New (7 files)
| File | Purpose |
|------|---------|
| `server/prisma/data/aptitude_questions.json` | 470 questions (copied from Downloads) |
| `server/prisma/data/topic_theory.json` | 61 theory entries (copied from Downloads) |
| `server/src/services/interviewService.ts` | Categories, topics, questions, progress, stats |
| `server/src/routes/interview.ts` | All `/interview/*` endpoints |
| `client/src/pages/InterviewHub.tsx` | Category selection landing page |
| `client/src/pages/InterviewCategory.tsx` | Topic grid for a category |
| `client/src/pages/InterviewTheory.tsx` | Study notes / theory viewer |
| `client/src/pages/InterviewQuiz.tsx` | MCQ quiz with instant feedback + solutions |

### No Changes To
- 7 game engine files (MemoryMatch, Hangman, etc.)
- tutorialService.ts, domainService.ts
- DomainSelection, DomainJourney, ConceptTutorial pages
- redis.ts, prisma.ts, auth.ts

---

## Key Design Decisions

1. **Static questions from JSON, NOT LLM-generated**: Aptitude questions need precise numbers and verified answers. LLM-generated math questions can have calculation errors. The JSON bank provides curated, tested questions.
2. **Theory from JSON, NOT LLM**: The `topic_theory_notes.json` already has structured notes (key points, formulas, examples, tutorials). No need to call the LLM — just render the pre-processed data.
3. **Separate DB tables**: Interview prep uses `InterviewCategory/Topic/Question` tables, NOT the learning `Domain/Topic` tables. The data structures are fundamentally different (flat question banks vs. hierarchical skill trees).
4. **Pre-filled correct answers**: The solved JSON (`aptitude_book_470_solved.json`) has `correct_answer` (letter) and `correct_index` (0-based) for all 470 questions. Grading is a direct index comparison — no LLM needed at any point.
5. **Dedicated quiz component**: Instead of routing through the 7 game engines, the interview quiz is a purpose-built MCQ component with instant feedback. The existing games can be adapted later for theory learning.
6. **3 categories match the JSON sections**: A=Quant, B=Logic, C=Verbal — directly mapped from the source data.

## How To Run

```bash
# Terminal 1 — Server
cd capstone/server
npm run dev

# Terminal 2 — Client
cd capstone/client
npm run dev

# Ensure Redis is running on port 6379
# Ensure PostgreSQL is running with database "learndb"

# If you need to re-seed:
cd capstone/server
npx prisma generate
npx prisma db seed
```

Demo login: `student@example.com` / `password`