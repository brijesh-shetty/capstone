import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getCompanyReadiness } from '../services/readinessService';

const router = Router();

// A company's pattern profile can carry optional role TRACKS (SDE, Analyst, …).
// When a track is chosen its rounds/interviewStyle win; otherwise we fall back
// to the profile's top-level rounds/interviewStyle (backward compatible).
function resolveRounds(profile: any, track?: string): any[] {
  if (track && Array.isArray(profile?.tracks)) {
    const t = profile.tracks.find((x: any) => x.role === track);
    if (t && Array.isArray(t.rounds)) return t.rounds;
  }
  return Array.isArray(profile?.rounds) ? profile.rounds : [];
}

// Maps profile rounds → AssessmentTest sections (selection rules resolved at
// attempt start by assessmentService.resolveSection).
function roundsToSections(rounds: any[]) {
  return rounds.map((r: any, i: number) => ({
    title: r.title || `Round ${i + 1}`,
    kind: r.kind || 'MIXED',
    order: i,
    marksPerQuestion: Number(r.marksPerQuestion) || 1,
    selectionRule: {
      strategy: r.strategy || 'RANDOM',
      category: r.category,
      count: r.count ?? 10,
      ...(r.difficultyMix ? { difficultyMix: r.difficultyMix } : {}),
      ...(r.topicSlugs ? { topicSlugs: r.topicSlugs } : {}),
      verifiedOnly: true,
    },
  }));
}

// GET /companies — list with profile summary (rounds + style, no internals)
router.get('/', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
    res.json(
      companies.map((c) => {
        const profile = (c.profile as any) || {};
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          logoUrl: c.logoUrl,
          rounds: (profile.rounds || []).map((r: any) => ({ title: r.title, count: r.count })),
          tracks: (profile.tracks || []).map((t: any) => t.role),
          durationMinutes: profile.durationMinutes,
          hasInterviewStyle: !!profile.interviewStyle || (profile.tracks || []).some((t: any) => t.interviewStyle),
        };
      })
    );
  } catch (error) {
    console.error('Companies list error:', error);
    res.status(500).json({ error: 'Failed to list companies' });
  }
});

// GET /companies/:slug/prep — everything the Company Prep hub needs:
// profile overview, the student's company attempts + interviews, and the
// Placement Readiness Index.
router.get('/:slug/prep', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const company = await prisma.company.findUnique({ where: { slug: req.params.slug } });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const profile = (company.profile as any) || {};

    const [attempts, interviews, readiness] = await Promise.all([
      prisma.testAttempt.findMany({
        where: { userId: req.userId!, test: { companyId: company.id } },
        select: { id: true, status: true, score: true, startedAt: true, submittedAt: true },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
      prisma.aiInterview.findMany({
        where: { userId: req.userId!, companyId: company.id },
        select: { id: true, status: true, overallScore: true, role: true, startedAt: true },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }),
      getCompanyReadiness(req.userId!, company.id),
    ]);

    return res.json({
      id: company.id,
      name: company.name,
      slug: company.slug,
      logoUrl: company.logoUrl,
      notes: company.notes,
      durationMinutes: profile.durationMinutes ?? null,
      negativeMarking: profile.negativeMarking ?? 0,
      passScore: profile.passScore ?? null,
      rounds: (profile.rounds || []).map((r: any) => ({
        title: r.title,
        kind: r.kind,
        category: r.category,
        count: r.count,
        difficultyMix: r.difficultyMix ?? null,
      })),
      tracks: (profile.tracks || []).map((t: any) => ({ role: t.role })),
      attempts,
      interviews,
      readiness,
    });
  } catch (error) {
    console.error('Company prep error:', error);
    res.status(500).json({ error: 'Failed to load company prep' });
  }
});

// GET /companies/:id/readiness — readiness index only (for widgets)
router.get('/:id/readiness', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    return res.json(await getCompanyReadiness(req.userId!, company.id));
  } catch (error) {
    console.error('Company readiness error:', error);
    res.status(500).json({ error: 'Failed to compute readiness' });
  }
});

// POST /companies/:id/practice-test { track? } — build (once per track) and
// return the company's PROCTORED pattern mock from our own verified bank.
router.post('/:id/practice-test', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const profile = (company.profile as any) || {};
    const track = req.body?.track as string | undefined;
    const rounds = resolveRounds(profile, track);
    if (rounds.length === 0) {
      return res.status(400).json({ error: 'Company has no round profile' });
    }

    const title = `${company.name}${track ? ` (${track})` : ''} — Pattern Mock (Proctored)`;
    const existing = await prisma.assessmentTest.findFirst({
      where: { companyId: company.id, title, status: 'PUBLISHED' },
    });
    if (existing) return res.json({ testId: existing.id, title, reused: true });

    const test = await prisma.assessmentTest.create({
      data: {
        title,
        description: `Built from the ${company.name} pattern profile (round structure + difficulty mix). Questions come from our own verified bank.`,
        durationMinutes: profile.durationMinutes || 60,
        mode: 'PROCTORED',
        randomizeOrder: true,
        negativeMarking: Number(profile.negativeMarking) || 0,
        passScore: profile.passScore ?? null,
        status: 'PUBLISHED',
        companyId: company.id,
        createdById: req.userId,
        sections: { create: roundsToSections(rounds) },
      },
    });
    res.json({ testId: test.id, title: test.title, reused: false });
  } catch (error) {
    console.error('Company practice-test error:', error);
    res.status(500).json({ error: 'Failed to build company test' });
  }
});

// POST /companies/:id/round-practice { topicSlugs?, category?, count? }
// Build a low-stakes PRACTICE test to drill a single round or weak topics,
// before sitting the full proctored mock.
router.post('/:id/round-practice', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    let topicSlugs: string[] | undefined = Array.isArray(req.body?.topicSlugs)
      ? req.body.topicSlugs.slice(0, 20)
      : undefined;
    // accept topic NAMES too (readiness/weak-topics report names) → resolve slugs
    const topicNames: string[] | undefined = Array.isArray(req.body?.topicNames)
      ? req.body.topicNames.slice(0, 20)
      : undefined;
    if (!topicSlugs?.length && topicNames?.length) {
      const resolved = await prisma.assessmentTopic.findMany({
        where: { name: { in: topicNames } },
        select: { slug: true },
      });
      topicSlugs = resolved.map((t) => t.slug);
    }
    const category: string | undefined = req.body?.category;
    const count = Math.max(1, Math.min(20, Number(req.body?.count) || 8));
    if (!topicSlugs?.length && !category) {
      return res.status(400).json({ error: 'Provide topicSlugs, topicNames, or a category to practice' });
    }

    const label = topicSlugs?.length ? 'Weak Topics' : category;
    const test = await prisma.assessmentTest.create({
      data: {
        title: `${company.name} — ${label} Drill (Practice)`,
        description: `Targeted practice for ${company.name}. Built from our own bank — not proctored.`,
        durationMinutes: Math.max(10, count * 2),
        mode: 'PRACTICE',
        negativeMarking: 0,
        status: 'PUBLISHED',
        companyId: company.id,
        createdById: req.userId,
        sections: {
          create: [
            {
              title: label || 'Practice',
              kind: 'MIXED',
              order: 0,
              marksPerQuestion: 1,
              selectionRule: topicSlugs?.length
                ? { strategy: 'ONE_PER_TOPIC', topicSlugs, verifiedOnly: true }
                : { strategy: 'RANDOM', category, count, verifiedOnly: true },
            },
          ],
        },
      },
    });
    res.json({ testId: test.id, title: test.title });
  } catch (error) {
    console.error('Company round-practice error:', error);
    res.status(500).json({ error: 'Failed to build practice drill' });
  }
});

export default router;
