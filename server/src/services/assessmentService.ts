import { prisma } from '../lib/prisma';

// Assessment engine: resolves section selection rules into a concrete item
// list (snapshotted per attempt), manages the attempt lifecycle, and grades
// server-side. The client never computes marks and never sees correct answers
// before submission.

export interface SelectionRule {
  strategy: 'ONE_PER_TOPIC' | 'RANDOM';
  category?: 'QUANTITATIVE' | 'LOGICAL' | 'VERBAL' | 'CODING';
  count?: number; // RANDOM only
  topicSlugs?: string[]; // optional topic filter
  difficultyMix?: Record<string, number>; // {EASY:0.3, MEDIUM:0.5, HARD:0.2}
  verifiedOnly?: boolean;
}

export interface SnapshotItem {
  kind: 'question' | 'coding';
  id: string;
  sectionId: string;
  sectionTitle: string;
  sectionKind: string;
  marks: number;
  order: number;
}

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Picks per the difficulty mix when given, otherwise uniformly.
function pickWithMix<T extends { difficulty: string }>(
  pool: T[],
  count: number,
  mix?: Record<string, number>
): T[] {
  if (!mix || count >= pool.length) return shuffle(pool).slice(0, count);
  const byDiff: Record<string, T[]> = {};
  for (const item of shuffle(pool)) (byDiff[item.difficulty] ??= []).push(item);
  const picked: T[] = [];
  for (const [diff, frac] of Object.entries(mix)) {
    const want = Math.round(count * frac);
    picked.push(...(byDiff[diff] || []).splice(0, want));
  }
  // fill any shortfall from whatever is left
  const leftovers = shuffle(Object.values(byDiff).flat());
  while (picked.length < count && leftovers.length) picked.push(leftovers.pop()!);
  return picked.slice(0, count);
}

async function resolveSection(
  section: {
    id: string;
    title: string;
    kind: string;
    selectionRule: any;
    marksPerQuestion: number;
    items: { questionId: string | null; codingProblemId: string | null; order: number }[];
  },
  proctored: boolean
): Promise<SnapshotItem[]> {
  const out: SnapshotItem[] = [];
  const base = {
    sectionId: section.id,
    sectionTitle: section.title,
    sectionKind: section.kind,
    marks: section.marksPerQuestion,
  };

  // pinned items first, in their fixed order
  for (const item of [...section.items].sort((a, b) => a.order - b.order)) {
    if (item.questionId) out.push({ ...base, kind: 'question', id: item.questionId, order: out.length });
    else if (item.codingProblemId) out.push({ ...base, kind: 'coding', id: item.codingProblemId, order: out.length });
  }

  const rule = section.selectionRule as SelectionRule | null;
  if (!rule) return out;

  // PROCTORED tests never serve unverified content, regardless of the rule
  const verifiedOnly = proctored || rule.verifiedOnly === true;
  const pinnedIds = new Set(out.map((i) => i.id));

  if (rule.category === 'CODING' || section.kind === 'CODING') {
    const pool = await prisma.codingProblem.findMany({
      where: {
        ...(verifiedOnly ? { verified: true } : {}),
        ...(rule.topicSlugs ? { topic: { slug: { in: rule.topicSlugs } } } : {}),
        topic: { category: 'CODING', ...(rule.topicSlugs ? { slug: { in: rule.topicSlugs } } : {}) },
      },
      select: { id: true, difficulty: true, topicId: true },
    });
    const candidates = pool.filter((p) => !pinnedIds.has(p.id));
    const picked =
      rule.strategy === 'ONE_PER_TOPIC'
        ? onePerTopic(candidates)
        : pickWithMix(candidates, rule.count ?? 1, rule.difficultyMix);
    for (const p of picked) out.push({ ...base, kind: 'coding', id: p.id, order: out.length });
    return out;
  }

  const pool = await prisma.assessmentQuestion.findMany({
    where: {
      ...(verifiedOnly ? { verified: true } : {}),
      topic: {
        ...(rule.category ? { category: rule.category } : {}),
        ...(rule.topicSlugs ? { slug: { in: rule.topicSlugs } } : {}),
      },
    },
    select: { id: true, difficulty: true, topicId: true, assets: true },
  });
  // never serve questions that can't be answered as displayed: figure-based
  // items with no image attached, truncated items, and audit-flagged items
  // whose context/passage was lost in extraction
  const servable = pool.filter((q) => {
    const a = q.assets as any;
    if (a?.requiresImage && !(Array.isArray(a?.images) && a.images.length > 0)) return false;
    if (a?.incompleteOptions) return false;
    if (a?.audit && a.audit.status !== 'SELF_CONTAINED') return false;
    return true;
  });
  const candidates = servable.filter((q) => !pinnedIds.has(q.id));

  let picked: { id: string; difficulty: string; topicId: string }[];
  if (rule.strategy === 'ONE_PER_TOPIC') {
    picked = onePerTopic(candidates);
  } else {
    picked = pickWithMix(candidates, rule.count ?? 10, rule.difficultyMix);
  }
  for (const q of picked) out.push({ ...base, kind: 'question', id: q.id, order: out.length });
  return out;
}

function onePerTopic<T extends { topicId: string }>(pool: T[]): T[] {
  const byTopic: Record<string, T[]> = {};
  for (const item of shuffle(pool)) (byTopic[item.topicId] ??= []).push(item);
  return Object.values(byTopic).map((items) => items[0]);
}

export async function startAttempt(userId: string, testId: string) {
  const test = await prisma.assessmentTest.findUnique({
    where: { id: testId },
    include: { sections: { include: { items: true }, orderBy: { order: 'asc' } } },
  });
  if (!test) throw new Error('Test not found');
  if (test.status !== 'PUBLISHED') throw new Error('Test is not published');

  // resume an open attempt instead of creating a parallel one
  const existing = await prisma.testAttempt.findFirst({
    where: { testId, userId, status: 'IN_PROGRESS' },
  });
  if (existing) return getAttemptPayload(existing.id, userId);

  const snapshot: SnapshotItem[] = [];
  for (const section of test.sections) {
    snapshot.push(...(await resolveSection(section, test.mode === 'PROCTORED')));
  }
  if (test.randomizeOrder) {
    // shuffle within each section, keep section blocks contiguous
    const bySection = new Map<string, SnapshotItem[]>();
    for (const item of snapshot) {
      bySection.set(item.sectionId, [...(bySection.get(item.sectionId) || []), item]);
    }
    snapshot.length = 0;
    for (const items of bySection.values()) snapshot.push(...shuffle(items));
  }
  snapshot.forEach((item, i) => (item.order = i));

  if (snapshot.length === 0) throw new Error('Test resolved to zero items — check section rules');

  const attempt = await prisma.testAttempt.create({
    data: { testId, userId, itemsSnapshot: snapshot as any },
  });

  // Concurrent start calls (e.g. React StrictMode double-mount) can race past
  // the findFirst above — keep only the oldest open attempt.
  const oldest = await prisma.testAttempt.findFirst({
    where: { testId, userId, status: 'IN_PROGRESS' },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
  });
  if (oldest && oldest.id !== attempt.id) {
    await prisma.testAttempt.delete({ where: { id: attempt.id } });
    return getAttemptPayload(oldest.id, userId);
  }
  return getAttemptPayload(attempt.id, userId);
}

// Full payload the runner needs: item content (sans answers), saved responses,
// authoritative remaining time.
export async function getAttemptPayload(attemptId: string, userId: string) {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: { test: true, responses: true },
  });
  if (!attempt || attempt.userId !== userId) throw new Error('Attempt not found');

  const remainingSec = remainingSeconds(attempt);
  if (attempt.status === 'IN_PROGRESS' && remainingSec <= 0) {
    // hard-expire: grade whatever was saved
    await gradeAttempt(attempt.id, 'EXPIRED');
    return getAttemptPayload(attemptId, userId);
  }

  // PROCTORED attempts withhold all content until monitoring consent is recorded
  if (
    attempt.test.mode === 'PROCTORED' &&
    attempt.status === 'IN_PROGRESS' &&
    !attempt.consentAt
  ) {
    return {
      attemptId: attempt.id,
      status: attempt.status,
      needsConsent: true,
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        description: attempt.test.description,
        durationMinutes: attempt.test.durationMinutes,
        mode: attempt.test.mode,
        negativeMarking: attempt.test.negativeMarking,
        passScore: attempt.test.passScore,
      },
      remainingSec,
      startedAt: attempt.startedAt,
      items: [],
      responses: [],
    };
  }

  const snapshot = (attempt.itemsSnapshot as any as SnapshotItem[]) || [];
  const questionIds = snapshot.filter((i) => i.kind === 'question').map((i) => i.id);
  const codingIds = snapshot.filter((i) => i.kind === 'coding').map((i) => i.id);

  const [questions, codingProblems] = await Promise.all([
    prisma.assessmentQuestion.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        stem: true,
        type: true,
        difficulty: true,
        assets: true,
        options: { select: { id: true, text: true, order: true }, orderBy: { order: 'asc' } },
      },
    }),
    prisma.codingProblem.findMany({
      where: { id: { in: codingIds } },
      select: {
        id: true,
        title: true,
        slug: true,
        statement: true,
        difficulty: true,
        constraints: true,
        sampleIo: true,
        starterCode: true,
        timeLimitMs: true,
      },
    }),
  ]);
  const qMap = Object.fromEntries(questions.map((q) => [q.id, q]));
  const cMap = Object.fromEntries(codingProblems.map((c) => [c.id, c]));

  return {
    attemptId: attempt.id,
    status: attempt.status,
    test: {
      id: attempt.test.id,
      title: attempt.test.title,
      description: attempt.test.description,
      durationMinutes: attempt.test.durationMinutes,
      mode: attempt.test.mode,
      negativeMarking: attempt.test.negativeMarking,
      passScore: attempt.test.passScore,
    },
    remainingSec,
    startedAt: attempt.startedAt,
    items: snapshot.map((item) => ({
      ...item,
      content: item.kind === 'question' ? qMap[item.id] ?? null : cMap[item.id] ?? null,
    })),
    responses: attempt.responses.map((r) => ({
      questionId: r.questionId,
      codingProblemId: r.codingProblemId,
      answer: r.answer,
      flagged: r.flagged,
      // marks/isCorrect intentionally not exposed while IN_PROGRESS
    })),
    ...(attempt.status !== 'IN_PROGRESS'
      ? { score: attempt.score, breakdown: attempt.breakdown }
      : {}),
  };
}

function remainingSeconds(attempt: { startedAt: Date; test: { durationMinutes: number } }) {
  const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000;
  return Math.max(0, Math.round(attempt.test.durationMinutes * 60 - elapsed));
}

export async function recordConsent(attemptId: string, userId: string) {
  const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== userId) throw new Error('Attempt not found');
  if (!attempt.consentAt) {
    await prisma.testAttempt.update({
      where: { id: attemptId },
      data: { consentAt: new Date() },
    });
  }
  return getAttemptPayload(attemptId, userId);
}

export async function saveResponse(
  attemptId: string,
  userId: string,
  payload: {
    kind: 'question' | 'coding';
    itemId: string;
    answer?: any;
    flagged?: boolean;
    timeSpentSec?: number;
  }
) {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: { test: true },
  });
  if (!attempt || attempt.userId !== userId) throw new Error('Attempt not found');
  if (attempt.status !== 'IN_PROGRESS') throw new Error('Attempt is no longer in progress');
  if (remainingSeconds(attempt) <= 0) {
    await gradeAttempt(attempt.id, 'EXPIRED');
    throw new Error('Time is up — attempt auto-submitted');
  }

  const snapshot = (attempt.itemsSnapshot as any as SnapshotItem[]) || [];
  if (!snapshot.some((i) => i.kind === payload.kind && i.id === payload.itemId)) {
    throw new Error('Item is not part of this attempt');
  }

  const key =
    payload.kind === 'question'
      ? { attemptId_questionId: { attemptId, questionId: payload.itemId } }
      : { attemptId_codingProblemId: { attemptId, codingProblemId: payload.itemId } };

  const data: any = {};
  if (payload.answer !== undefined) data.answer = payload.answer;
  if (payload.flagged !== undefined) data.flagged = payload.flagged;
  if (payload.timeSpentSec) data.timeSpentSec = { increment: payload.timeSpentSec };

  await prisma.attemptResponse.upsert({
    where: key as any,
    update: data,
    create: {
      attemptId,
      ...(payload.kind === 'question'
        ? { questionId: payload.itemId }
        : { codingProblemId: payload.itemId }),
      answer: payload.answer ?? undefined,
      flagged: payload.flagged ?? false,
      timeSpentSec: payload.timeSpentSec ?? 0,
    },
  });
  return { saved: true, remainingSec: remainingSeconds(attempt) };
}

// Server-side grading. MCQ: chosen option ids vs isCorrect; negative marking
// applies to wrong MCQs only. Coding: marks were persisted by /code/submit
// (fraction of weighted hidden tests passed).
export async function gradeAttempt(attemptId: string, finalStatus: 'SUBMITTED' | 'EXPIRED') {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: { test: true, responses: true },
  });
  if (!attempt) throw new Error('Attempt not found');
  if (attempt.status !== 'IN_PROGRESS') return attempt; // already graded

  const snapshot = (attempt.itemsSnapshot as any as SnapshotItem[]) || [];
  const questionIds = snapshot.filter((i) => i.kind === 'question').map((i) => i.id);
  const questions = await prisma.assessmentQuestion.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      topic: { select: { name: true, category: true } },
      options: { select: { id: true, isCorrect: true } },
    },
  });
  const qMap = Object.fromEntries(questions.map((q) => [q.id, q]));

  let totalMarks = 0;
  let scoredMarks = 0;
  let ungraded = 0;
  const sectionAgg: Record<string, { title: string; scored: number; total: number }> = {};
  const topicAgg: Record<string, { correct: number; total: number; category: string }> = {};

  for (const item of snapshot) {
    const agg = (sectionAgg[item.sectionId] ??= { title: item.sectionTitle, scored: 0, total: 0 });

    if (item.kind === 'question') {
      const q = qMap[item.id];
      const response = attempt.responses.find((r) => r.questionId === item.id);
      const correctIds = q?.options.filter((o) => o.isCorrect).map((o) => o.id) ?? [];

      // no answer key yet (unverified question in a PRACTICE test): ungraded —
      // it must neither penalize nor count toward the total
      if (correctIds.length === 0) {
        ungraded++;
        if (response) {
          await prisma.attemptResponse.update({
            where: { id: response.id },
            data: { isCorrect: null, marks: 0 },
          });
        }
        continue;
      }

      totalMarks += item.marks;
      agg.total += item.marks;
      const chosen: string[] = Array.isArray(response?.answer)
        ? (response!.answer as string[])
        : response?.answer
          ? [response.answer as any as string]
          : [];
      const tAgg = q
        ? (topicAgg[q.topic.name] ??= { correct: 0, total: 0, category: q.topic.category })
        : null;
      if (tAgg) tAgg.total++;

      let marks = 0;
      let isCorrect: boolean | null = null;
      if (chosen.length > 0) {
        isCorrect =
          chosen.length === correctIds.length && chosen.every((c) => correctIds.includes(c));
        marks = isCorrect ? item.marks : -attempt.test.negativeMarking;
        if (isCorrect && tAgg) tAgg.correct++;
      }
      scoredMarks += marks;
      agg.scored += marks;
      if (response) {
        await prisma.attemptResponse.update({
          where: { id: response.id },
          data: { isCorrect, marks },
        });
      }
    } else {
      totalMarks += item.marks;
      agg.total += item.marks;
      // coding: marks column holds 0..1 fraction from /code/submit
      const response = attempt.responses.find((r) => r.codingProblemId === item.id);
      const fraction = response?.marks ?? 0;
      const marks = fraction * item.marks;
      scoredMarks += marks;
      agg.scored += marks;
      if (response && response.marks !== marks) {
        await prisma.attemptResponse.update({
          where: { id: response.id },
          data: { marks },
        });
      }
    }
  }

  const percentage = totalMarks > 0 ? Math.max(0, (scoredMarks / totalMarks) * 100) : 0;
  const breakdown = {
    totalMarks,
    scoredMarks: Math.round(scoredMarks * 100) / 100,
    ungraded, // questions without a confirmed answer key (excluded from totals)
    percentage: Math.round(percentage * 10) / 10,
    passed: attempt.test.passScore != null ? percentage >= attempt.test.passScore : null,
    sections: Object.values(sectionAgg).map((s) => ({
      title: s.title,
      scored: Math.round(s.scored * 100) / 100,
      total: s.total,
    })),
    topics: Object.entries(topicAgg).map(([name, t]) => ({
      name,
      category: t.category,
      correct: t.correct,
      total: t.total,
      accuracy: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0,
    })),
  };

  return prisma.testAttempt.update({
    where: { id: attemptId },
    data: {
      status: finalStatus,
      submittedAt: new Date(),
      durationUsedSec: Math.round((Date.now() - attempt.startedAt.getTime()) / 1000),
      score: breakdown.percentage,
      breakdown: breakdown as any,
    },
  });
}

// Post-submit review: per-question correct answers + explanations (only after grading).
export async function getAttemptReview(attemptId: string, userId: string) {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: { test: true, responses: true },
  });
  if (!attempt || attempt.userId !== userId) throw new Error('Attempt not found');
  if (attempt.status === 'IN_PROGRESS') throw new Error('Attempt not submitted yet');

  const snapshot = (attempt.itemsSnapshot as any as SnapshotItem[]) || [];
  const questionIds = snapshot.filter((i) => i.kind === 'question').map((i) => i.id);
  const questions = await prisma.assessmentQuestion.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      stem: true,
      explanation: true,
      verified: true,
      assets: true,
      topic: { select: { name: true } },
      options: { select: { id: true, text: true, isCorrect: true, order: true }, orderBy: { order: 'asc' } },
    },
  });
  const qMap = Object.fromEntries(questions.map((q) => [q.id, q]));

  const breakdown = attempt.breakdown as any;
  const weakTopics = ((breakdown?.topics as any[]) || [])
    .filter((t) => t.total > 0 && t.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy);

  return {
    attemptId: attempt.id,
    score: attempt.score,
    breakdown: attempt.breakdown,
    weakTopics,
    status: attempt.status,
    durationUsedSec: attempt.durationUsedSec,
    items: snapshot.map((item) => {
      const response = attempt.responses.find((r) =>
        item.kind === 'question' ? r.questionId === item.id : r.codingProblemId === item.id
      );
      if (item.kind === 'question') {
        const q = qMap[item.id];
        return {
          ...item,
          stem: q?.stem,
          topic: q?.topic.name,
          options: q?.options,
          // worked explanations only for verified questions (per the content policy)
          explanation: q?.verified ? q.explanation : null,
          chosen: response?.answer ?? null,
          isCorrect: response?.isCorrect ?? null,
          marks: response?.marks ?? 0,
          timeSpentSec: response?.timeSpentSec ?? 0,
        };
      }
      return {
        ...item,
        answer: response?.answer ?? null,
        isCorrect: response?.isCorrect ?? null,
        marks: response?.marks ?? 0,
        timeSpentSec: response?.timeSpentSec ?? 0,
      };
    }),
  };
}

// "Practice your weak topics" CTA: builds and publishes a personal PRACTICE
// test with one question per weak topic (accuracy < 60% in the given attempt).
export async function createWeakTopicPractice(userId: string, attemptId: string) {
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId },
    include: { responses: true },
  });
  if (!attempt || attempt.userId !== userId) throw new Error('Attempt not found');
  if (attempt.status === 'IN_PROGRESS') throw new Error('Submit the attempt first');

  const breakdown = attempt.breakdown as any;
  const weakNames: string[] = ((breakdown?.topics as any[]) || [])
    .filter((t) => t.total > 0 && t.accuracy < 60)
    .map((t) => t.name);
  if (weakNames.length === 0) throw new Error('No weak topics found — nice work!');

  const topics = await prisma.assessmentTopic.findMany({
    where: { name: { in: weakNames } },
    select: { slug: true },
  });
  const topicSlugs = topics.map((t) => t.slug);

  const test = await prisma.assessmentTest.create({
    data: {
      title: `Weak Topics Practice — ${new Date().toLocaleDateString('en-IN')}`,
      description: `Auto-built from your attempt: ${weakNames.join(', ')}`,
      durationMinutes: Math.max(15, topicSlugs.length * 2),
      mode: 'PRACTICE',
      negativeMarking: 0,
      status: 'PUBLISHED',
      createdById: userId,
      sections: {
        create: [
          {
            title: 'Weak Topics',
            kind: 'MIXED',
            order: 0,
            marksPerQuestion: 1,
            selectionRule: { strategy: 'ONE_PER_TOPIC', topicSlugs, verifiedOnly: true },
          },
        ],
      },
    },
  });
  return { testId: test.id, title: test.title, topics: weakNames };
}
