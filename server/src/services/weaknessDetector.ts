import { prisma } from '../lib/prisma';
import { Priority } from '@prisma/client';

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
  const gameAttempts = await prisma.questionAttempt.findMany({
    where: { session: { userId, topicId } },
    orderBy: { session: { playedAt: 'asc' } },
    select: { isCorrect: true, difficulty: true },
  });

  const topic = await prisma.topic.findUnique({ where: { id: topicId } });
  const testAttempts = topic ? await prisma.testQuestion.findMany({
    where: { test: { userId }, subtopic: topic.subtopic },
    orderBy: { test: { takenAt: 'asc' } },
    select: { isCorrect: true, difficulty: true },
  }) : [];

  const allAttempts = [...gameAttempts, ...testAttempts];
  const score = computeMastery(allAttempts);
  const { isWeak, priority } = classifyTopic(score);
  const due = new Date();
  due.setDate(due.getDate() + 3);

  await prisma.masteryScore.upsert({
    where:  { userId_topicId: { userId, topicId } },
    update: { score, isWeak, attemptCount: allAttempts.length, lastUpdated: new Date() },
    create: { userId, topicId, score, isWeak, attemptCount: allAttempts.length },
  });

  if (isWeak && priority !== 'NONE') {
    await prisma.studyPlan.upsert({
      where:  { userId_topicId: { userId, topicId } },
      update: { priority: priority as Priority, isCompleted: false, dueDate: due },
      create: { userId, topicId, priority: priority as Priority, dueDate: due },
    });
  }
}
