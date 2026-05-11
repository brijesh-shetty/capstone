import { prisma } from '../lib/prisma';
import { awardXp } from './xpService';

export interface AchievementEvent {
  type: 'game_completed' | 'level_up' | 'perfect_score' | 'speed_run';
  userId: string;
  data: any;
}

export async function checkAchievements(event: AchievementEvent) {
  const { userId, type, data } = event;
  
  // Get all unearned achievements for this user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userAchievements: true,
      domainProgress: true,
      gameSessions: true,
    }
  });

  if (!user) return [];

  const earnedAchievementIds = new Set(user.userAchievements.map(ua => ua.achievementId));
  
  const allAchievements = await prisma.achievement.findMany();
  const unearned = allAchievements.filter(a => !earnedAchievementIds.has(a.id));

  const newlyEarned = [];

  for (const achievement of unearned) {
    let earned = false;
    let condition;
    
    try {
      condition = JSON.parse(achievement.condition);
    } catch (e) {
      console.error(`Invalid condition JSON in achievement ${achievement.slug}`);
      continue;
    }

    switch (condition.type) {
      case 'game_count':
        if (type === 'game_completed' && user.gameSessions.length >= condition.value) {
          earned = true;
        }
        break;
        
      case 'perfect_score':
        if (type === 'perfect_score') {
          earned = true;
        }
        break;
        
      case 'speed_run':
        if (type === 'speed_run' && data.durationSec <= condition.seconds) {
          earned = true;
        }
        break;
        
      case 'domain_count':
        if (user.domainProgress.length >= condition.value) {
          earned = true;
        }
        break;
        
      case 'domain_level':
        if (type === 'level_up' && data.newLevel >= condition.value) {
          earned = true;
        } else if (user.domainProgress.some(p => p.currentLevel >= condition.value)) {
          earned = true;
        }
        break;
        
      case 'game_variety':
        if (type === 'game_completed') {
          const uniqueTypes = new Set(user.gameSessions.map(s => s.gameType));
          if (uniqueTypes.size >= condition.value) {
            earned = true;
          }
        }
        break;

      case 'time_of_day':
        if (type === 'game_completed') {
          const hour = new Date().getHours();
          // For night_owl (hour 0-4)
          if (condition.hour === 0 && (hour >= 0 && hour < 5)) {
            earned = true;
          }
        }
        break;
        
      // Add more conditions as needed...
    }

    if (earned) {
      // Award it
      await prisma.userAchievement.create({
        data: { userId, achievementId: achievement.id }
      });
      
      if (achievement.xpReward > 0) {
        await awardXp(userId, achievement.xpReward);
      }
      
      newlyEarned.push(achievement);
    }
  }

  return newlyEarned;
}

export async function getUserAchievements(userId: string) {
  const allAchievements = await prisma.achievement.findMany({
    orderBy: { createdAt: 'asc' }
  });
  
  const userAchievements = await prisma.userAchievement.findMany({
    where: { userId },
  });
  
  const earnedMap = new Map(userAchievements.map(ua => [ua.achievementId, ua.earnedAt]));

  return allAchievements.map(a => ({
    ...a,
    isEarned: earnedMap.has(a.id),
    earnedAt: earnedMap.get(a.id) || null,
  }));
}
