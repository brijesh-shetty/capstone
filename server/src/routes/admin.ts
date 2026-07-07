import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { SNAPSHOT_DIR } from './assessments';

const router = Router();
const adminOnly = [authMiddleware, requireRole('ADMIN', 'EDUCATOR')];

// GET /admin/review-queue?filter=unverified|disagreement|image|incomplete|needs-context&page=1&topic=slug
router.get('/review-queue', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const filter = (req.query.filter as string) || 'unverified';
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const pageSize = 20;
    const topicSlug = req.query.topic as string | undefined;

    const where: any = { verified: false };
    if (topicSlug) where.topic = { slug: topicSlug };
    if (filter === 'disagreement') {
      where.assets = { path: ['solverDisagreement'], not: 'null' as any };
    } else if (filter === 'image') {
      where.assets = { path: ['requiresImage'], equals: true };
    } else if (filter === 'incomplete') {
      where.assets = { path: ['incompleteOptions'], equals: true };
    } else if (filter === 'needs-context') {
      // flagged by scripts/audit-context.ts — stem references missing context
      where.assets = { path: ['audit', 'status'], equals: 'NEEDS_CONTEXT' };
    }

    const [total, questions] = await Promise.all([
      prisma.assessmentQuestion.count({ where }),
      prisma.assessmentQuestion.findMany({
        where,
        include: {
          topic: { select: { name: true, slug: true, category: true } },
          options: { orderBy: { order: 'asc' } },
        },
        orderBy: [{ topic: { category: 'asc' } }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const counts = {
      unverified: await prisma.assessmentQuestion.count({ where: { verified: false } }),
      verified: await prisma.assessmentQuestion.count({ where: { verified: true } }),
    };

    res.json({ total, page, pageSize, counts, questions });
  } catch (error) {
    console.error('Review queue error:', error);
    res.status(500).json({ error: 'Failed to fetch review queue' });
  }
});

// POST /admin/questions/:id/verify  { optionId, explanation? }
// Human confirms the correct answer -> question becomes verified.
router.post('/questions/:id/verify', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { optionId, explanation } = req.body;
    const question = await prisma.assessmentQuestion.findUnique({
      where: { id: req.params.id },
      include: { options: true },
    });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const option = question.options.find((o) => o.id === optionId);
    if (!option) return res.status(400).json({ error: 'Option does not belong to this question' });

    const letter = String.fromCharCode(65 + option.order);
    await prisma.$transaction([
      prisma.assessmentOption.updateMany({
        where: { questionId: question.id },
        data: { isCorrect: false },
      }),
      prisma.assessmentOption.update({ where: { id: option.id }, data: { isCorrect: true } }),
      prisma.assessmentQuestion.update({
        where: { id: question.id },
        data: {
          verified: true,
          proposedAnswer: letter,
          ...(explanation ? { explanation } : {}),
        },
      }),
    ]);

    res.json({ ok: true, verified: true, correctOption: letter });
  } catch (error) {
    console.error('Verify question error:', error);
    res.status(500).json({ error: 'Failed to verify question' });
  }
});

// POST /admin/questions/:id/reject — drop a broken question from the bank
router.post('/questions/:id/reject', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const question = await prisma.assessmentQuestion.findUnique({ where: { id: req.params.id } });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    await prisma.$transaction([
      prisma.attemptResponse.deleteMany({ where: { questionId: question.id } }),
      prisma.testSectionItem.deleteMany({ where: { questionId: question.id } }),
      prisma.assessmentOption.deleteMany({ where: { questionId: question.id } }),
      prisma.assessmentQuestion.delete({ where: { id: question.id } }),
    ]);
    res.json({ ok: true, deleted: true });
  } catch (error) {
    console.error('Reject question error:', error);
    res.status(500).json({ error: 'Failed to reject question' });
  }
});

// ===== Proctoring review (admins only — students never see this) =====

// GET /admin/attempts?testId= — attempts with event counts
router.get('/attempts', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const attempts = await prisma.testAttempt.findMany({
      where: req.query.testId ? { testId: req.query.testId as string } : {},
      include: {
        user: { select: { name: true, email: true } },
        test: { select: { title: true, mode: true, company: { select: { name: true } } } },
        _count: { select: { proctoringEvents: true, responses: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    res.json(attempts);
  } catch (error) {
    console.error('Admin attempts error:', error);
    res.status(500).json({ error: 'Failed to list attempts' });
  }
});

// GET /admin/attempts/:id/proctoring — full event timeline for one attempt
router.get('/attempts/:id/proctoring', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { name: true, email: true } },
        test: { select: { title: true, mode: true, durationMinutes: true } },
        proctoringEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    const counts: Record<string, number> = {};
    for (const e of attempt.proctoringEvents) counts[e.type] = (counts[e.type] || 0) + 1;
    res.json({
      attemptId: attempt.id,
      user: attempt.user,
      test: attempt.test,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      consentAt: attempt.consentAt,
      score: attempt.score,
      eventCounts: counts,
      events: attempt.proctoringEvents,
    });
  } catch (error) {
    console.error('Proctoring timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// Integrity heuristic — a triage signal for reviewers, never a verdict.
const INTEGRITY_WEIGHTS: Record<string, number> = {
  TAB_BLUR: 2,
  FULLSCREEN_EXIT: 3,
  COPY: 3,
  PASTE: 4,
  FACE_NOT_DETECTED: 2,
  MULTIPLE_FACES: 5,
  NO_CAMERA: 4,
};

function integritySignal(counts: Record<string, number>) {
  let score = 0;
  for (const [type, n] of Object.entries(counts)) score += (INTEGRITY_WEIGHTS[type] || 0) * n;
  const level = score === 0 ? 'CLEAN' : score < 8 ? 'LOW' : score < 20 ? 'MEDIUM' : 'HIGH';
  return {
    score,
    level,
    note: 'Heuristic signal from event counts — for reviewer triage, not a verdict.',
  };
}

// GET /admin/attempts/:id/report — full per-attempt report
router.get('/attempts/:id/report', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const attempt = await prisma.testAttempt.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { name: true, email: true } },
        test: { select: { title: true, mode: true, durationMinutes: true, passScore: true } },
        responses: {
          include: {
            question: { select: { stem: true, topic: { select: { name: true } } } },
            codingProblem: { select: { title: true } },
          },
        },
        proctoringEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    const counts: Record<string, number> = {};
    for (const e of attempt.proctoringEvents) counts[e.type] = (counts[e.type] || 0) + 1;

    res.json({
      attemptId: attempt.id,
      user: attempt.user,
      test: attempt.test,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      consentAt: attempt.consentAt,
      durationUsedSec: attempt.durationUsedSec,
      score: attempt.score,
      breakdown: attempt.breakdown,
      integrity: integritySignal(counts),
      eventCounts: counts,
      events: attempt.proctoringEvents,
      responses: attempt.responses.map((r) => ({
        item: r.question ? r.question.stem.slice(0, 120) : r.codingProblem?.title,
        topic: r.question?.topic.name ?? 'Coding',
        isCorrect: r.isCorrect,
        marks: r.marks,
        timeSpentSec: r.timeSpentSec,
        flagged: r.flagged,
      })),
    });
  } catch (error) {
    console.error('Attempt report error:', error);
    res.status(500).json({ error: 'Failed to build report' });
  }
});

// GET /admin/tests/:id/cohort — aggregate analytics across all attempts of a test
router.get('/tests/:id/cohort', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const test = await prisma.assessmentTest.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, mode: true, durationMinutes: true },
    });
    if (!test) return res.status(404).json({ error: 'Test not found' });

    const attempts = await prisma.testAttempt.findMany({
      where: { testId: test.id },
      select: { id: true, status: true, score: true, durationUsedSec: true },
    });
    const closed = attempts.filter((a) => a.status !== 'IN_PROGRESS');
    const scores = closed.map((a) => a.score ?? 0);

    const distribution = Array.from({ length: 10 }, (_, i) => ({
      bucket: `${i * 10}-${i * 10 + 10}`,
      count: scores.filter((s) => s >= i * 10 && (i === 9 ? s <= 100 : s < i * 10 + 10)).length,
    }));

    // per-question and per-topic accuracy across the cohort (graded MCQs only)
    const responses = await prisma.attemptResponse.findMany({
      where: { attempt: { testId: test.id }, questionId: { not: null }, isCorrect: { not: null } },
      select: {
        isCorrect: true,
        timeSpentSec: true,
        question: { select: { id: true, stem: true, topic: { select: { name: true, category: true } } } },
      },
    });
    const byQuestion: Record<string, { stem: string; topic: string; correct: number; total: number }> = {};
    const byTopic: Record<string, { category: string; correct: number; total: number }> = {};
    for (const r of responses) {
      const q = r.question!;
      const bq = (byQuestion[q.id] ??= { stem: q.stem.slice(0, 100), topic: q.topic.name, correct: 0, total: 0 });
      bq.total++;
      if (r.isCorrect) bq.correct++;
      const bt = (byTopic[q.topic.name] ??= { category: q.topic.category, correct: 0, total: 0 });
      bt.total++;
      if (r.isCorrect) bt.correct++;
    }

    res.json({
      test,
      attemptCount: attempts.length,
      completionRate: attempts.length > 0 ? Math.round((closed.length / attempts.length) * 100) : 0,
      avgScore: scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
      avgDurationSec: closed.length > 0 ? Math.round(closed.reduce((a, b) => a + b.durationUsedSec, 0) / closed.length) : null,
      distribution,
      hardestQuestions: Object.values(byQuestion)
        .filter((q) => q.total >= 1)
        .map((q) => ({ ...q, accuracy: Math.round((q.correct / q.total) * 100) }))
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 10),
      topicHeatmap: Object.entries(byTopic)
        .map(([name, t]) => ({ name, category: t.category, accuracy: Math.round((t.correct / t.total) * 100), answered: t.total }))
        .sort((a, b) => a.accuracy - b.accuracy),
    });
  } catch (error) {
    console.error('Cohort analytics error:', error);
    res.status(500).json({ error: 'Failed to build cohort analytics' });
  }
});

// GET /admin/tests/:id/export.csv — attempts as CSV
router.get('/tests/:id/export.csv', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const attempts = await prisma.testAttempt.findMany({
      where: { testId: req.params.id },
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { proctoringEvents: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['name', 'email', 'status', 'score_percent', 'started_at', 'submitted_at', 'duration_sec', 'proctoring_events'].join(','),
      ...attempts.map((a) =>
        [
          esc(a.user.name), esc(a.user.email), a.status, a.score ?? '',
          a.startedAt.toISOString(), a.submittedAt?.toISOString() ?? '',
          a.durationUsedSec, a._count.proctoringEvents,
        ].join(',')
      ),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attempts.csv"');
    res.send(rows.join('\n'));
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to export' });
  }
});

// GET /admin/attempts/:id/snapshots/:file — access-controlled snapshot image
router.get('/attempts/:id/snapshots/:file', ...adminOnly, async (req: AuthRequest, res: Response) => {
  const file = path.basename(req.params.file); // strips any path traversal
  if (!/^\d+\.jpg$/.test(file)) return res.status(400).json({ error: 'Invalid snapshot name' });
  const full = path.join(SNAPSHOT_DIR, req.params.id, file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Snapshot not found' });
  res.setHeader('Content-Type', 'image/jpeg');
  fs.createReadStream(full).pipe(res);
});

export default router;
