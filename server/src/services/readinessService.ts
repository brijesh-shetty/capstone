import { prisma } from '../lib/prisma';

// Per-company Placement Readiness Index.
//
// Blends a student's company-specific performance into one explainable 0–100
// score. The guiding principle (the trust moat vs. black-box scores): a missing
// signal is NEVER silently treated as zero. Instead its weight is removed and
// the remaining weights are renormalized, while `confidence` reflects how much
// of the picture we actually have and `nextActions` nudges the student to fill
// the gaps. Computed on the fly — no stored table to go stale.

const WEIGHTS = {
  patternMock: 0.4, // depth: best proctored company pattern-mock score
  topicCoverage: 0.25, // breadth: how many of the company's topics are not weak
  aiInterview: 0.25, // best company-styled AI interview rubric (0–100)
  consistency: 0.1, // repeated, recent practice for this company
} as const;

const WEAK_ACCURACY = 60; // topic accuracy below this counts as "weak"

type ComponentKey = keyof typeof WEIGHTS;

interface ReadinessComponent {
  key: ComponentKey;
  label: string;
  value: number; // 0–100
  weight: number;
  present: boolean;
}

interface NextAction {
  label: string;
  action: 'mock' | 'round-practice' | 'interview';
  target?: string[]; // e.g. weak topic names to drill
}

export interface CompanyReadiness {
  score: number; // 0–100, renormalized over present components
  confidence: number; // 0–100 — share of total weight that is actually measured
  components: ReadinessComponent[];
  nextActions: NextAction[];
  weakTopics: string[];
}

interface TopicStat {
  name: string;
  category: string;
  correct: number;
  total: number;
  accuracy: number;
}

export async function getCompanyReadiness(
  userId: string,
  companyId: string
): Promise<CompanyReadiness> {
  const [attempts, interviews, user] = await Promise.all([
    prisma.testAttempt.findMany({
      where: {
        userId,
        status: { in: ['SUBMITTED', 'EXPIRED'] },
        test: { companyId },
      },
      select: { score: true, breakdown: true, submittedAt: true },
      orderBy: { submittedAt: 'desc' },
    }),
    prisma.aiInterview.findMany({
      where: { userId, companyId, status: 'COMPLETED' },
      select: { overallScore: true, endedAt: true },
      orderBy: { endedAt: 'desc' },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true } }),
  ]);

  // ---- pattern mock (depth) + topic coverage (breadth) from the best attempt ----
  const scoredAttempts = attempts.filter((a) => a.score != null);
  const bestAttempt = scoredAttempts.reduce<typeof scoredAttempts[number] | null>(
    (best, a) => (best == null || (a.score ?? 0) > (best.score ?? 0) ? a : best),
    null
  );

  const patternPresent = bestAttempt != null;
  const patternValue = clamp(bestAttempt?.score ?? 0);

  const topics: TopicStat[] = ((bestAttempt?.breakdown as any)?.topics as TopicStat[]) || [];
  const gradedTopics = topics.filter((t) => t.total > 0);
  const weakTopics = gradedTopics
    .filter((t) => t.accuracy < WEAK_ACCURACY)
    .sort((a, b) => a.accuracy - b.accuracy)
    .map((t) => t.name);
  // breadth: fraction of the company's measured topics the student is solid on
  const coveragePresent = gradedTopics.length > 0;
  const coverageValue = coveragePresent
    ? Math.round(((gradedTopics.length - weakTopics.length) / gradedTopics.length) * 100)
    : 0;

  // ---- company AI interview ----
  const scoredInterviews = interviews.filter((i) => i.overallScore != null);
  const interviewPresent = scoredInterviews.length > 0;
  const interviewValue = clamp(
    scoredInterviews.reduce((m, i) => Math.max(m, i.overallScore ?? 0), 0)
  );

  // ---- consistency / recency ----
  const activities = scoredAttempts.length + scoredInterviews.length;
  const consistencyPresent = activities > 0;
  const streak = user?.streakDays ?? 0;
  const consistencyValue = clamp(activities * 25 + (streak >= 3 ? 25 : 0));

  const components: ReadinessComponent[] = [
    { key: 'patternMock', label: 'Pattern mock', value: patternValue, weight: WEIGHTS.patternMock, present: patternPresent },
    { key: 'topicCoverage', label: 'Topic coverage', value: coverageValue, weight: WEIGHTS.topicCoverage, present: coveragePresent },
    { key: 'aiInterview', label: 'AI interview', value: interviewValue, weight: WEIGHTS.aiInterview, present: interviewPresent },
    { key: 'consistency', label: 'Consistency', value: consistencyValue, weight: WEIGHTS.consistency, present: consistencyPresent },
  ];

  // renormalize over present components — a missing signal lowers confidence,
  // never the score
  const presentWeight = components.filter((c) => c.present).reduce((s, c) => s + c.weight, 0);
  const score = presentWeight
    ? Math.round(
        components
          .filter((c) => c.present)
          .reduce((s, c) => s + c.value * c.weight, 0) / presentWeight
      )
    : 0;
  const confidence = Math.round(presentWeight * 100); // weights sum to 1

  return {
    score,
    confidence,
    components,
    weakTopics,
    nextActions: buildNextActions(components, weakTopics),
  };
}

function buildNextActions(components: ReadinessComponent[], weakTopics: string[]): NextAction[] {
  const actions: NextAction[] = [];
  const by = Object.fromEntries(components.map((c) => [c.key, c])) as Record<ComponentKey, ReadinessComponent>;

  // 1) fill missing high-weight signals first
  if (!by.patternMock.present) {
    actions.push({ label: 'Take the proctored pattern mock', action: 'mock' });
  }
  if (!by.aiInterview.present) {
    actions.push({ label: 'Do a company-style AI interview', action: 'interview' });
  }
  // 2) then improve weak topics if we have coverage data
  if (weakTopics.length > 0) {
    actions.push({
      label: `Drill weak topics: ${weakTopics.slice(0, 3).join(', ')}`,
      action: 'round-practice',
      target: weakTopics.slice(0, 5),
    });
  }
  // 3) low pattern score but already attempted → retake after practice
  if (by.patternMock.present && by.patternMock.value < 60 && weakTopics.length === 0) {
    actions.push({ label: 'Retake the pattern mock to raise your score', action: 'mock' });
  }
  // already strong everywhere
  if (actions.length === 0) {
    actions.push({ label: "You're well prepared — keep your streak alive", action: 'mock' });
  }
  return actions;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
