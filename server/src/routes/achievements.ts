import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getUserAchievements } from '../services/achievementService';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const achievements = await getUserAchievements(req.userId!);
    res.json(achievements);
  } catch (error) {
    console.error('Failed to fetch achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// GET /achievements/recent - Get last 3 earned
router.get('/recent', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const achievements = await getUserAchievements(req.userId!);
    const earned = achievements
      .filter(a => a.isEarned)
      .sort((a, b) => new Date(b.earnedAt!).getTime() - new Date(a.earnedAt!).getTime())
      .slice(0, 3);
      
    res.json(earned);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recent achievements' });
  }
});

export default router;
