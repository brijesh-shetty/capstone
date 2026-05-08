import { prisma } from '../lib/prisma';
import { awardXp, XP_RULES } from './xpService';

export async function updateStreak(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastActiveAt: true, streakDays: true }
  });

  if (!user) return;

  const now = new Date();
  const lastActive = user.lastActiveAt ? new Date(user.lastActiveAt) : null;
  
  let newStreak = user.streakDays || 0;
  
  if (!lastActive) {
    // First time activity
    newStreak = 1;
  } else {
    // Check if activity was yesterday
    const msInDay = 1000 * 60 * 60 * 24;
    
    // Normalize to start of day in UTC for accurate day diff
    const todayStr = now.toISOString().split('T')[0];
    const lastActiveStr = lastActive.toISOString().split('T')[0];
    
    if (todayStr !== lastActiveStr) {
      const todayDate = new Date(todayStr).getTime();
      const lastActiveDate = new Date(lastActiveStr).getTime();
      const diffDays = Math.round((todayDate - lastActiveDate) / msInDay);
      
      if (diffDays === 1) {
        newStreak += 1;
      } else if (diffDays > 1) {
        newStreak = 1; // Streak broken
      }
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { 
      lastActiveAt: now,
      streakDays: newStreak
    }
  });

  // Award 7-day streak milestone
  if (newStreak > 0 && newStreak % 7 === 0) {
    await awardXp(userId, XP_RULES.daily_streak_7 || 200);
  }
}
