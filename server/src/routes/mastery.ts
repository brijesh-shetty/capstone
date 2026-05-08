import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/mastery', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const scores = await prisma.masteryScore.findMany({
      where: { userId: req.userId! },
      include: { topic: true },
      orderBy: { score: 'desc' }
    });
    res.json(scores);
  } catch (error) {
    console.error('Mastery fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch mastery scores' });
  }
});

router.get('/study-plan', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const plans = await prisma.studyPlan.findMany({
      where: { userId: req.userId!, isCompleted: false },
      include: { topic: true },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' }
      ]
    });
    res.json(plans);
  } catch (error) {
    console.error('Study plan fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch study plans' });
  }
});

router.get('/study-plan/:topicId/explain', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { topicId } = req.params;
    const userId = req.userId!;

    const score = await prisma.masteryScore.findUnique({
      where: { userId_topicId: { userId, topicId } },
      include: { topic: true }
    });

    if (!score) return res.status(404).json({ error: 'Topic not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { explainWeakTopic } = await import('../services/explanationService');
    const stream = await explainWeakTopic(score.topic.subtopic, score.score);

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Explanation streaming error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Failed to generate explanation' })}\n\n`);
    res.end();
  }
});

router.get('/study-plan/:topicId/problems', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { topicId } = req.params;
    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const { getRemedialProblems } = await import('../services/questionService');
    const questions = await getRemedialProblems(topic.subtopic);

    const sessionKey = `session:${req.userId!}:${Date.now()}`;
    const { redis } = await import('../lib/redis');
    await redis.set(sessionKey, JSON.stringify(questions), 'EX', 3600);

    res.json({
      sessionKey,
      topicId: topic.id,
      topicName: topic.topic,
      questions: questions.map(q => ({
        hash:         q.hash,
        questionText: q.questionText,
        options:      q.options,
        difficulty:   q.difficulty,
        subtopic:     q.subtopic
      })),
    });
  } catch (error) {
    console.error('Remedial problems error:', error);
    res.status(500).json({ error: 'Failed to generate remedial problems' });
  }
});

router.post('/study-plan/:topicId/complete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { topicId } = req.params;
    const userId = req.userId!;

    const plan = await prisma.studyPlan.findUnique({
      where: { userId_topicId: { userId, topicId } }
    });

    if (!plan) return res.status(404).json({ error: 'Study plan not found' });

    await prisma.studyPlan.update({
      where: { userId_topicId: { userId, topicId } },
      data: { isCompleted: true }
    });

    const { awardXp } = await import('../services/xpService');
    await awardXp(userId, 150); // XP_RULES.weak_topic_mastered

    res.json({ success: true, message: 'Study plan completed', xpEarned: 150 });
  } catch (error) {
    console.error('Complete study plan error:', error);
    res.status(500).json({ error: 'Failed to complete study plan' });
  }
});

export default router;
