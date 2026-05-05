import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

const router = Router();

// Search existing seeded topics
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q = '', subject = '' } = req.query;
    const searchQuery = (q as string).toLowerCase();
    const filterSubject = (subject as string);

    const whereClause: any = { isActive: true };

    if (filterSubject) {
      whereClause.subject = { equals: filterSubject, mode: 'insensitive' };
    }

    if (searchQuery) {
      whereClause.OR = [
        { subject: { contains: searchQuery, mode: 'insensitive' } },
        { topic: { contains: searchQuery, mode: 'insensitive' } },
        { subtopic: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    const topics = await prisma.topic.findMany({
      where: whereClause,
      take: 50
    });

    res.json(topics);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Generate or fetch a topic entry for any arbitrary topic string
// This allows users to play on any topic, not just seeded ones.
router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { topicName } = req.body;
    if (!topicName || typeof topicName !== 'string' || topicName.trim().length < 2) {
      return res.status(400).json({ error: 'topicName must be at least 2 characters' });
    }

    const trimmed = topicName.trim();

    // Check Redis cache for a previously generated topicId for this name
    const cacheKey = `topic:custom:${trimmed.toLowerCase().replace(/\s+/g, '_')}`;
    const cachedId = await redis.get(cacheKey);
    if (cachedId) {
      const existing = await prisma.topic.findUnique({ where: { id: cachedId } });
      if (existing) return res.json(existing);
    }

    // Also check DB – maybe it was seeded or previously created
    const existingTopic = await prisma.topic.findFirst({
      where: { subtopic: { equals: trimmed, mode: 'insensitive' } }
    });
    if (existingTopic) {
      await redis.set(cacheKey, existingTopic.id, 'EX', 60 * 60 * 24 * 7);
      return res.json(existingTopic);
    }

    // Create a new Topic row for this custom subtopic
    const newTopic = await prisma.topic.create({
      data: {
        subject: 'Custom',
        topic: trimmed,
        subtopic: trimmed,
        isActive: true,
      }
    });

    await redis.set(cacheKey, newTopic.id, 'EX', 60 * 60 * 24 * 7);
    return res.json(newTopic);
  } catch (error) {
    console.error('Generate topic error:', error);
    res.status(500).json({ error: 'Failed to generate topic' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const topic = await prisma.topic.findUnique({
      where: { id }
    });

    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    res.json(topic);
  } catch (error) {
    console.error('Get topic error:', error);
    res.status(500).json({ error: 'Failed to get topic' });
  }
});

export default router;
