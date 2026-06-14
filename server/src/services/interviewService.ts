import { prisma } from '../lib/prisma';
import Groq from 'groq-sdk';
import { redis } from '../lib/redis';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ===== Practice-quiz integrity (lightweight, non-punitive) =====
// The proctored AssessmentRunner has the heavyweight path (camera, snapshots,
// per-attempt ProctoringEvent rows). Practice quizzes are low-stakes, so we only
// accept a small client-reported summary of focus/clipboard activity, validate it
// server-side, and turn it into an advisory signal. It never changes score or XP.

export type IntegrityEventType =
  | 'TAB_BLUR' | 'COPY' | 'PASTE' | 'CONTEXT_MENU';

export interface IntegrityInput {
  counts?: Partial<Record<IntegrityEventType, number>>;
  // seconds the tab was hidden in total (client-measured, advisory only)
  hiddenMs?: number;
}

export interface IntegritySummary {
  counts: Record<IntegrityEventType, number>;
  hiddenMs: number;
  // weighted advisory signal — a signal, NOT a verdict of cheating
  signal: 'CLEAN' | 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
}

const INTEGRITY_WEIGHTS: Record<IntegrityEventType, number> = {
  TAB_BLUR: 3,      // leaving the quiz tab
  PASTE: 4,         // pasting an answer in
  COPY: 1,          // copying the question out
  CONTEXT_MENU: 1,  // right-click (often precedes copy)
};

const MAX_PER_TYPE = 100; // clamp client-reported counts to a sane ceiling

// Validate + clamp the client payload, then derive an advisory signal.
export function summarizeIntegrity(input?: IntegrityInput): IntegritySummary | null {
  if (!input || typeof input !== 'object') return null;
  const counts: Record<IntegrityEventType, number> = {
    TAB_BLUR: 0, COPY: 0, PASTE: 0, CONTEXT_MENU: 0,
  };
  let raw = input.counts ?? {};
  let score = 0;
  for (const key of Object.keys(counts) as IntegrityEventType[]) {
    const n = Number(raw[key]);
    const clamped = Number.isFinite(n) ? Math.min(MAX_PER_TYPE, Math.max(0, Math.floor(n))) : 0;
    counts[key] = clamped;
    score += clamped * INTEGRITY_WEIGHTS[key];
  }
  const hiddenMs = Math.min(60 * 60 * 1000, Math.max(0, Math.floor(Number(input.hiddenMs) || 0)));
  // extended time away from the tab adds to the signal (1 point per 10s, capped)
  score += Math.min(20, Math.floor(hiddenMs / 10_000));

  let signal: IntegritySummary['signal'] = 'CLEAN';
  if (score >= 20) signal = 'HIGH';
  else if (score >= 8) signal = 'MEDIUM';
  else if (score >= 1) signal = 'LOW';

  return { counts, hiddenMs, signal, score };
}


export const getInterviewCategories = async (userId: string) => {
  const categories = await prisma.interviewCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { topics: true },
      },
    },
  });

  // Calculate user progress per category
  const progress = await prisma.userInterviewProgress.findMany({
    where: { userId },
    include: {
      topic: true,
    },
  });

  return categories.map((category) => {
    const categoryProgress = progress.filter((p) => p.topic.categoryId === category.id);
    const totalXp = categoryProgress.reduce((sum, p) => sum + p.totalXp, 0);
    const avgScore = categoryProgress.length > 0 
      ? categoryProgress.reduce((sum, p) => sum + p.avgScore, 0) / categoryProgress.length 
      : 0;

    return {
      ...category,
      topicCount: category._count.topics,
      userProgress: {
        totalXp,
        avgScore: Math.round(avgScore * 10) / 10,
        topicsStarted: categoryProgress.length,
      },
    };
  });
};

export const getCategoryTopics = async (slug: string, userId: string) => {
  const category = await prisma.interviewCategory.findUnique({
    where: { slug },
    include: {
      topics: {
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: {
            select: { questions: true },
          },
          theory: {
            select: { id: true }, // just to check if it exists
          },
          progress: {
            where: { userId },
          },
        },
      },
    },
  });

  if (!category) {
    throw new Error('Category not found');
  }

  return {
    ...category,
    topics: category.topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      questionCount: topic._count.questions,
      hasTheory: !!topic.theory,
      progress: topic.progress[0] || {
        gamesPlayed: 0,
        bestScore: 0,
        avgScore: 0,
        totalXp: 0,
      },
    })),
  };
};

export const getTopicQuestions = async (topicId: string, limit: number = 10) => {
  const allQuestions = await prisma.interviewQuestion.findMany({
    where: { topicId },
    select: {
      id: true,
      question: true,
      optionA: true,
      optionB: true,
      optionC: true,
      optionD: true,
      optionE: true,
      difficulty: true,
      // intentionally NOT selecting correctAnswer or correctIndex here to prevent cheating
    },
  });

  // Shuffle and pick `limit` questions
  const shuffled = allQuestions.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, limit);
};

export const getTopicTheory = async (topicId: string) => {
  const theory = await prisma.interviewTheory.findUnique({
    where: { topicId },
  });

  if (!theory) {
    throw new Error('Theory not found for this topic');
  }

  return theory;
};

export const submitInterviewQuiz = async (
  userId: string,
  topicId: string,
  answers: { questionId: string; chosenIndex: number; hintUsed?: boolean }[],
  integrityInput?: IntegrityInput
) => {
  const integrity = summarizeIntegrity(integrityInput);
  let score = 0;
  let totalHintsUsed = 0;
  const results = [];

  for (const answer of answers) {
    const question = await prisma.interviewQuestion.findUnique({
      where: { id: answer.questionId },
      select: { id: true, correctIndex: true, correctAnswer: true },
    });

    if (question) {
      const isCorrect = question.correctIndex === answer.chosenIndex;
      if (isCorrect) score += 10;
      if (answer.hintUsed) totalHintsUsed++;
      
      results.push({
        questionId: question.id,
        isCorrect,
        correctIndex: question.correctIndex,
        correctAnswer: question.correctAnswer,
        hintUsed: !!answer.hintUsed
      });
    }
  }

  const maxScore = answers.length * 10;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  
  // Base XP is 1.5x score
  let xpEarned = Math.floor(score * 1.5); 
  // 20% XP penalty per hint used, up to a max penalty of 80% (so they still get something)
  if (totalHintsUsed > 0) {
    const penaltyMultiplier = Math.max(0.2, 1 - (totalHintsUsed * 0.2));
    xpEarned = Math.floor(xpEarned * penaltyMultiplier);
  }

  // Update Progress
  const existingProgress = await prisma.userInterviewProgress.findUnique({
    where: {
      userId_topicId: {
        userId,
        topicId,
      },
    },
  });

  if (existingProgress) {
    const newGamesPlayed = existingProgress.gamesPlayed + 1;
    const newAvgScore = ((existingProgress.avgScore * existingProgress.gamesPlayed) + percentage) / newGamesPlayed;
    
    await prisma.userInterviewProgress.update({
      where: { id: existingProgress.id },
      data: {
        gamesPlayed: newGamesPlayed,
        bestScore: Math.max(existingProgress.bestScore, percentage),
        avgScore: newAvgScore,
        totalXp: existingProgress.totalXp + xpEarned,
        lastPlayedAt: new Date(),
        lastIntegrity: (integrity ?? undefined) as any,
      },
    });
  } else {
    await prisma.userInterviewProgress.create({
      data: {
        userId,
        topicId,
        gamesPlayed: 1,
        bestScore: percentage,
        avgScore: percentage,
        totalXp: xpEarned,
        lastPlayedAt: new Date(),
        lastIntegrity: (integrity ?? undefined) as any,
      },
    });
  }

  return {
    score,
    maxScore,
    percentage,
    xpEarned,
    results,
    integrity,
  };
};

export const getInterviewStats = async (userId: string) => {
  const progress = await prisma.userInterviewProgress.findMany({
    where: { userId },
    include: { topic: { include: { category: true } } },
  });

  const totalXp = progress.reduce((sum, p) => sum + p.totalXp, 0);
  const gamesPlayed = progress.reduce((sum, p) => sum + p.gamesPlayed, 0);
  
  const categoryStats: Record<string, { totalScore: number, count: number, avg: number, name: string }> = {};
  
  progress.forEach(p => {
    const cat = p.topic.category;
    if (!categoryStats[cat.slug]) {
      categoryStats[cat.slug] = { totalScore: 0, count: 0, avg: 0, name: cat.name };
    }
    categoryStats[cat.slug].totalScore += p.avgScore;
    categoryStats[cat.slug].count += 1;
  });

  Object.values(categoryStats).forEach(c => {
    c.avg = c.count > 0 ? c.totalScore / c.count : 0;
  });

  return {
    totalXp,
    gamesPlayed,
    topicsStarted: progress.length,
    categoryStats,
    recentTopics: progress.sort((a: any, b: any) => (b.lastPlayedAt?.getTime() || 0) - (a.lastPlayedAt?.getTime() || 0)).slice(0, 5),
  };
};

export const generateHint = async (questionId: string) => {
  const cacheKey = `hint:${questionId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const question = await prisma.interviewQuestion.findUnique({ where: { id: questionId } });
  if (!question) throw new Error('Question not found');

  const options = [question.optionA, question.optionB, question.optionC, question.optionD];
  if (question.optionE) options.push(question.optionE);

  const prompt = `You are a helpful aptitude tutor. Give a brief, one-sentence hint for the following question without revealing the actual answer.
Question: ${question.question}
Options: ${options.join(', ')}
`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.5,
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }]
  });

  const hint = (response.choices[0]?.message?.content || 'No hint available.').trim();
  await redis.set(cacheKey, hint, 'EX', 86400); // cache for 24h
  return hint;
};

export const generateExplanation = async (questionId: string) => {
  const cacheKey = `explain:${questionId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const question = await prisma.interviewQuestion.findUnique({ where: { id: questionId } });
  if (!question) throw new Error('Question not found');

  const options = [question.optionA, question.optionB, question.optionC, question.optionD];
  if (question.optionE) options.push(question.optionE);

  const prompt = `You are an expert aptitude tutor. Explain step-by-step how to solve this question. Include any formula used.
Question: ${question.question}
Options: ${options.join(', ')}
Correct Answer: ${question.correctAnswer}

Provide a concise, clear step-by-step solution.`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.3,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  });

  const explanation = (response.choices[0]?.message?.content || 'Explanation not available.').trim();
  await redis.set(cacheKey, explanation, 'EX', 86400); // cache for 24h
  return explanation;
};
