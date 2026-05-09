import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getUserDomainProgress, getDomainTopicsTree, generateCustomDomain } from '../services/domainService';
import { getConceptTutorial, getQuickNotes } from '../services/tutorialService';

const router = Router();

// GET /domains - List all domains with user's progress
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const domains = await getUserDomainProgress(req.userId!);
    res.json(domains);
  } catch (error) {
    console.error('Failed to get domains:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// GET /domains/:slug - Get specific domain and its topic tree
router.get('/:slug', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const data = await getDomainTopicsTree(req.userId!, req.params.slug);
    if (!data) return res.status(404).json({ error: 'Domain not found' });
    res.json(data);
  } catch (error) {
    console.error('Failed to get domain topics:', error);
    res.status(500).json({ error: 'Failed to fetch domain topics' });
  }
});

// GET /domains/tutorial/:topicId - Generate a concept tutorial for a topic
router.get('/tutorial/:topicId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const topic = await prisma.topic.findUnique({ where: { id: req.params.topicId } });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    // Maps levelOrder to difficulty string for the prompt
    const diffLabel = ['easy', 'medium', 'hard', 'advanced'][topic.levelOrder - 1] || 'medium';
    
    const tutorial = await getConceptTutorial(topic.subtopic, diffLabel);
    
    res.json(tutorial);
  } catch (error) {
    console.error('Failed to generate tutorial:', error);
    res.status(500).json({ error: 'Failed to generate concept tutorial' });
  }
});

// GET /domains/quick-notes/:topicId/:gameType - Generate quick notes for a game
router.get('/quick-notes/:topicId/:gameType', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const topic = await prisma.topic.findUnique({ where: { id: req.params.topicId } });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const notes = await getQuickNotes(topic.subtopic, req.params.gameType);
    res.json(notes);
  } catch (error) {
    console.error('Failed to generate quick notes:', error);
    res.status(500).json({ error: 'Failed to generate quick notes' });
  }
});

// POST /domains/generate - Generate a custom domain
router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const newDomain = await generateCustomDomain(name, description);
    res.status(201).json(newDomain);
  } catch (error) {
    console.error('Failed to generate custom domain:', error);
    res.status(500).json({ error: 'Failed to generate custom domain' });
  }
});

export default router;
