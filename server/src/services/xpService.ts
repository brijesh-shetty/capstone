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
  // Mini-game base XP (multiplied by score percentage)
  memory_match_base:    80,
  word_scramble_base:   90,
  crossword_base:      120,
  hangman_base:         70,
  fill_blank_base:      85,
  concept_cannon_base: 100,
  // Multipliers
  perfect_game_multiplier:  1.5,
  speed_game_multiplier:    1.2,
};

const LEVEL_THRESHOLDS = [0, 500, 1200, 2000, 3200, 5000, 8000, 12000, 18000];

export function calculateMiniGameXp(
  gameType: string,
  scorePercent: number,
  isPerfect: boolean,
  isFast: boolean
): number {
  const keyMap: Record<string, keyof typeof XP_RULES> = {
    MEMORY_MATCH:    'memory_match_base',
    WORD_SCRAMBLE:   'word_scramble_base',
    CROSSWORD:       'crossword_base',
    HANGMAN:         'hangman_base',
    FILL_BLANK:      'fill_blank_base',
    CONCEPT_CANNON:  'concept_cannon_base',
  };

  const baseKey = keyMap[gameType];
  const base = baseKey ? (XP_RULES[baseKey] as number) : 80;
  let xp = Math.round(base * (scorePercent / 100));

  if (isPerfect) {
    xp = Math.round(xp * XP_RULES.perfect_game_multiplier);
  } else if (isFast) {
    xp = Math.round(xp * XP_RULES.speed_game_multiplier);
  }

  return Math.max(xp, 0);
}

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
