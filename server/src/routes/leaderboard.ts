import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const topUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        level: true,
        xpTotal: true,
        streakDays: true
      },
      orderBy: { xpTotal: 'desc' },
      take: 20
    });

    const currentUserRank = topUsers.findIndex(u => u.id === req.userId) + 1;

    let rankInfo = null;
    if (currentUserRank > 0) {
      rankInfo = { rank: currentUserRank, ...topUsers[currentUserRank - 1] };
    } else {
      // User is not in top 20, fetch their specific rank (this is a simplified rank approx)
      const user = await prisma.user.findUnique({
        where: { id: req.userId! },
        select: { id: true, name: true, level: true, xpTotal: true, streakDays: true }
      });
      if (user) {
        const higherCount = await prisma.user.count({
          where: { xpTotal: { gt: user.xpTotal } }
        });
        rankInfo = { rank: higherCount + 1, ...user };
      }
    }

    res.json({
      leaderboard: topUsers,
      currentUser: rankInfo
    });
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export default router;
