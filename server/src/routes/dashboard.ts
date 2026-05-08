import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const gameSessions = await prisma.gameSession.findMany({
      where: { userId },
      orderBy: { playedAt: 'desc' },
      include: { topic: true }
    });

    const sessionsCount = gameSessions.length;
    
    const avgScore = sessionsCount > 0 
      ? Math.round(gameSessions.reduce((acc, curr) => acc + curr.score, 0) / sessionsCount)
      : 0;

    const recentGames = gameSessions.slice(0, 5).map(session => ({
      id: session.id,
      topicName: session.topic.topic,
      subtopic: session.topic.subtopic,
      score: session.score,
      xpEarned: session.xpEarned,
      playedAt: session.playedAt
    }));

    const recentTests = await prisma.test.findMany({
      where: { userId },
      orderBy: { takenAt: 'desc' },
      take: 3,
      select: {
        id: true,
        testType: true,
        scoredMarks: true,
        totalMarks: true,
        takenAt: true
      }
    });

    const weakTopics = await prisma.masteryScore.findMany({
      where: { userId, score: { lt: 60 } },
      orderBy: { score: 'asc' },
      take: 3,
      include: { topic: true }
    });

    const stats = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        level: user.level,
        xpTotal: user.xpTotal,
        streakDays: user.streakDays
      },
      gamesPlayed: sessionsCount,
      avgScore,
      recentGames,
      recentTests,
      weakTopics: weakTopics.map((wt: any) => ({
        topicId: wt.topicId,
        subject: wt.topic.subject,
        topic: wt.topic.topic,
        subtopic: wt.topic.subtopic,
        masteryLevel: wt.score
      }))
    };

    res.json(stats);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

export default router;
