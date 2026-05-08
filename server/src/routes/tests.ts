import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { masteryQueue } from '../jobs/masteryJob';
import { generateTest, TestConfig } from '../services/testService';
import { GeneratedQuestion } from '../services/questionService';

const router = Router();

router.get('/setup', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const quantCount = await prisma.topic.count({ where: { subject: 'Quantitative Aptitude' } });
    const logicalCount = await prisma.topic.count({ where: { subject: 'Logical Reasoning' } });
    const verbalCount = await prisma.topic.count({ where: { subject: 'Verbal Ability' } });

    res.json({
      topicsAvailable: {
        quant: quantCount,
        logical: logicalCount,
        verbal: verbalCount
      }
    });
  } catch (error) {
    console.error('Test setup error:', error);
    res.status(500).json({ error: 'Failed to fetch setup data' });
  }
});

router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const config: TestConfig = req.body;
    const userId = req.userId!;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'COLLEGE_STUDENT') {
      return res.status(403).json({ error: 'Only college students can take tests' });
    }

    const allQuestions = await generateTest(userId, config);

    const testSessionKey = `test:${userId}:${Date.now()}`;
    await redis.set(testSessionKey, JSON.stringify({
      config,
      questions: allQuestions
    }), 'EX', (config.timeLimitMin + 30) * 60);

    res.json({
      testSessionKey,
      config,
      questions: allQuestions.map((q: any) => ({
        hash:         q.hash,
        questionText: q.questionText,
        options:      q.options,
        difficulty:   q.difficulty,
        subtopic:     q.subtopic
      })),
    });
  } catch (error: any) {
    console.error('Test generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate test' });
  }
});

router.post('/submit', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { testSessionKey, answers } = req.body;
    const userId = req.userId!;

    const cached = await redis.get(testSessionKey);
    if (!cached) return res.status(400).json({ error: 'Test session expired' });

    const testData = JSON.parse(cached);
    const questions: GeneratedQuestion[] = testData.questions;
    const config: TestConfig = testData.config;
    const qMap = Object.fromEntries(questions.map(q => [q.hash, q]));

    let correctCount = 0;
    const topicIdsToRecalculate = new Set<string>();
    
    // Pre-fetch topic areas for mapping
    const subtopicAreas = await prisma.topic.findMany({
      where: { subtopic: { in: questions.map(q => q.subtopic) } },
      select: { id: true, subtopic: true, subject: true }
    });
    const subtopicAreaMap = Object.fromEntries(subtopicAreas.map(t => [t.subtopic, { area: t.subject, id: t.id }]));

    const testQuestions = answers.map((a: any) => {
      const q = qMap[a.hash];
      if (!q) throw new Error('Question hash mismatch');
      
      const isCorrect = q.correctAnswer === a.chosenAnswer;
      if (isCorrect) correctCount++;
      
      const topicInfo = subtopicAreaMap[q.subtopic];
      if (topicInfo) topicIdsToRecalculate.add(topicInfo.id);

      let topicArea = 'mixed';
      if (topicInfo?.area === 'Quantitative Aptitude') topicArea = 'aptitude';
      if (topicInfo?.area === 'Logical Reasoning') topicArea = 'logical';
      if (topicInfo?.area === 'Verbal Ability') topicArea = 'verbal';

      return { 
        questionHash: q.hash, 
        subtopic: q.subtopic, 
        topicArea,
        difficulty: q.difficulty, 
        isCorrect, 
        marksAwarded: isCorrect ? 1 : 0
      };
    });

    const testRecord = await prisma.test.create({
      data: {
        userId,
        testType: config.testType,
        subject: config.testType, // legacy field compat
        totalMarks: questions.length,
        scoredMarks: correctCount,
        timeLimitMin: config.timeLimitMin,
        questionCount: config.questionCount,
        testQuestions: { create: testQuestions }
      }
    });

    for (const topicId of topicIdsToRecalculate) {
      await masteryQueue.add('recalculate', { userId, topicId });
    }

    const { updateStreak } = await import('../services/streakService');
    await updateStreak(userId);

    res.json({
      testId: testRecord.id,
      scoredMarks: correctCount,
      totalMarks: questions.length,
      percentage: Math.round((correctCount / questions.length) * 100),
      results: answers.map((a: any) => ({
        hash:          a.hash,
        questionText:  qMap[a.hash].questionText,
        chosenAnswer:  a.chosenAnswer,
        isCorrect:     qMap[a.hash].correctAnswer === a.chosenAnswer,
        correctAnswer: qMap[a.hash].correctAnswer,
        explanation:   qMap[a.hash].explanation,
        subtopic:      qMap[a.hash].subtopic,
        topicArea:     subtopicAreaMap[qMap[a.hash].subtopic]?.area || 'Unknown'
      })),
    });
  } catch (error) {
    console.error('Submit test error:', error);
    res.status(500).json({ error: 'Failed to submit test' });
  }
});

router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tests = await prisma.test.findMany({
      where: { userId: req.userId! },
      orderBy: { takenAt: 'desc' },
      take: 10
    });
    res.json(tests);
  } catch (error) {
    console.error('Test history error:', error);
    res.status(500).json({ error: 'Failed to fetch test history' });
  }
});

router.get('/:testId/analysis', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const test = await prisma.test.findUnique({
      where: { id: req.params.testId },
      include: { testQuestions: true }
    });

    if (!test || test.userId !== req.userId) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const accuracyByTopic: Record<string, { total: number, correct: number }> = {};
    test.testQuestions.forEach(tq => {
      if (!accuracyByTopic[tq.subtopic]) accuracyByTopic[tq.subtopic] = { total: 0, correct: 0 };
      accuracyByTopic[tq.subtopic].total++;
      if (tq.isCorrect) accuracyByTopic[tq.subtopic].correct++;
    });

    const breakdown = Object.entries(accuracyByTopic).map(([subtopic, stats]) => ({
      subtopic,
      total: stats.total,
      correct: stats.correct,
      accuracy: Math.round((stats.correct / stats.total) * 100)
    }));

    const weakTopics = breakdown.filter(b => b.accuracy < 60);
    const strongTopics = breakdown.filter(b => b.accuracy >= 80);

    res.json({
      testInfo: {
        takenAt: test.takenAt,
        testType: test.testType,
        scoredMarks: test.scoredMarks,
        totalMarks: test.totalMarks,
        percentage: Math.round((test.scoredMarks / test.totalMarks) * 100),
        timeLimitMin: test.timeLimitMin
      },
      breakdown,
      weakTopics,
      strongTopics
    });
  } catch (error) {
    console.error('Test analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch test analysis' });
  }
});

export default router;
