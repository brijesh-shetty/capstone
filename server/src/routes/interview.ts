import express from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as interviewService from '../services/interviewService';
import { cleanupTheory } from '../services/interviewTheoryCleanup';

const router = express.Router();

router.use(authMiddleware);

router.get('/categories', async (req: AuthRequest, res) => {
  try {
    const categories = await interviewService.getInterviewCategories(req.userId!);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching interview categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.get('/categories/:slug', async (req: AuthRequest, res) => {
  try {
    const category = await interviewService.getCategoryTopics(req.params.slug, req.userId!);
    res.json(category);
  } catch (error: any) {
    if (error.message === 'Category not found') {
      res.status(404).json({ error: error.message });
    } else {
      console.error('Error fetching category topics:', error);
      res.status(500).json({ error: 'Failed to fetch topics' });
    }
  }
});

router.get('/topics/:topicId/questions', async (req, res) => {
  try {
    const count = parseInt(req.query.count as string) || 10;
    const questions = await interviewService.getTopicQuestions(req.params.topicId, count);
    res.json(questions);
  } catch (error) {
    console.error('Error fetching topic questions:', error);
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
});

router.get('/topics/:topicId/theory', async (req, res) => {
  try {
    const theory = await interviewService.getTopicTheory(req.params.topicId);
    res.json(theory);
  } catch (error: any) {
    if (error.message === 'Theory not found for this topic') {
      res.status(404).json({ error: error.message });
    } else {
      console.error('Error fetching topic theory:', error);
      res.status(500).json({ error: 'Failed to fetch theory' });
    }
  }
});

router.post('/submit', async (req: AuthRequest, res) => {
  try {
    const { topicId, answers, integrity } = req.body;

    if (!topicId || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Invalid payload: topicId and answers array are required' });
    }

    const result = await interviewService.submitInterviewQuiz(req.userId!, topicId, answers, integrity);
    res.json(result);
  } catch (error) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const stats = await interviewService.getInterviewStats(req.userId!);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/questions/:questionId/hint', async (req: AuthRequest, res) => {
  try {
    const hint = await interviewService.generateHint(req.params.questionId);
    res.json({ hint });
  } catch (error: any) {
    console.error('Error generating hint:', error);
    res.status(500).json({ error: error.message || 'Failed to generate hint' });
  }
});

router.get('/questions/:questionId/explanation', async (req: AuthRequest, res) => {
  try {
    const explanation = await interviewService.generateExplanation(req.params.questionId);
    res.json({ explanation });
  } catch (error: any) {
    console.error('Error generating explanation:', error);
    res.status(500).json({ error: error.message || 'Failed to generate explanation' });
  }
});

router.post('/admin/cleanup-theory', async (req: AuthRequest, res) => {
  try {
    const { topicId } = req.body;
    if (!topicId) return res.status(400).json({ error: 'topicId required' });
    const cleaned = await cleanupTheory(topicId);
    res.json(cleaned);
  } catch (error: any) {
    console.error('Error cleaning theory:', error);
    res.status(500).json({ error: error.message || 'Failed to clean theory' });
  }
});

export default router;
