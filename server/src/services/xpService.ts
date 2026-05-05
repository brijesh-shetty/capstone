import { prisma } from '../lib/prisma';

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

export async function awardXp(userId: string, amount: number) {
  await prisma.user.update({ where: { id: userId }, data: { xpTotal: { increment: amount } } });
  await checkLevelUp(userId);
}

async function checkLevelUp(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const newLevel = LEVEL_THRESHOLDS.findLastIndex(t => user.xpTotal >= t) + 1;
  if (newLevel !== user.level)
    await prisma.user.update({ where: { id: userId }, data: { level: newLevel } });
}
