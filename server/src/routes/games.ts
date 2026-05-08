import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getQuestions, GeneratedQuestion } from '../services/questionService';
import { redis } from '../lib/redis';
import { XP_RULES, awardXp } from '../services/xpService';
import { masteryQueue } from '../jobs/masteryJob';

const router = Router();

router.get('/session/:topicId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { topicId } = req.params;
    const difficulty = (parseInt(req.query.difficulty as string) || 2) as 1 | 2 | 3;

    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const questions = await getQuestions(topic.subtopic, difficulty, 10);

    // Store full questions (with answers) in Redis under a session key
    const sessionKey = `session:${req.userId}:${Date.now()}`;
    await redis.set(sessionKey, JSON.stringify(questions), 'EX', 3600);

    // Send questions to client WITHOUT correctAnswer or explanation
    res.json({
      sessionKey,
      topicId: topic.id,
      topicName: topic.topic,
      questions: questions.map(q => ({
        hash:         q.hash,
        questionText: q.questionText,
        options:      q.options,
        difficulty:   q.difficulty,
        // correctAnswer and explanation intentionally withheld
      })),
    });
  } catch (error) {
    console.error('Game session error:', error);
    res.status(500).json({ error: 'Failed to create game session' });
  }
});

router.post('/session/submit', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionKey, topicId, answers, durationSec } = req.body;
    const userId = req.userId!;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Invalid answers payload' });
    }

    const cached = await redis.get(sessionKey);
    if (!cached) return res.status(400).json({ error: 'Session expired' });

    const questions: GeneratedQuestion[] = JSON.parse(cached);
    const qMap = Object.fromEntries(questions.map(q => [q.hash, q]));

    let xp = 0;
    // We will find the session difficulty based on the first question or assume 2
    const sessionDifficulty = questions[0]?.difficulty || 2;

    const attempts = answers.map((a: any) => {
      const q = qMap[a.hash];
      if (!q) throw new Error('Question hash mismatch');
      
      const isCorrect = q.correctAnswer === a.chosenAnswer;
      if (isCorrect) {
        xp += [XP_RULES.correct_easy, XP_RULES.correct_medium, XP_RULES.correct_hard][q.difficulty - 1] || 10;
        if (a.timeTakenMs < 5000) xp += XP_RULES.speed_bonus;
      }
      if (a.hintUsed) xp += XP_RULES.hint_used; // negative value
      
      return { 
        questionHash: q.hash, 
        subtopic: q.subtopic, 
        difficulty: q.difficulty, 
        isCorrect, 
        timeTakenMs: a.timeTakenMs, 
        hintUsed: a.hintUsed || false 
      };
    });

    const correctCount = attempts.filter((a: any) => a.isCorrect).length;
    const score = Math.round((correctCount / attempts.length) * 100);

    await prisma.gameSession.create({
      data: { 
        userId, 
        topicId, 
        difficulty: sessionDifficulty, 
        score, 
        xpEarned: xp, 
        durationSec: durationSec || 0, 
        attempts: { create: attempts } 
      },
    });

    await awardXp(userId, xp);
    
    await masteryQueue.add('recalculate', { userId, topicId });
    
    const { updateStreak } = await import('../services/streakService');
    await updateStreak(userId);

    // Now safe to reveal answers
    res.json({
      score, 
      xpEarned: xp,
      results: answers.map((a: any) => ({
        hash:          a.hash,
        isCorrect:     qMap[a.hash].correctAnswer === a.chosenAnswer,
        correctAnswer: qMap[a.hash].correctAnswer,
        explanation:   qMap[a.hash].explanation,
      })),
    });
  } catch (error) {
    console.error('Submit session error:', error);
    res.status(500).json({ error: 'Failed to submit session' });
  }
});

router.post('/hint', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionKey, questionHash } = req.body;
    
    const cached = await redis.get(sessionKey);
    if (!cached) return res.status(400).json({ error: 'Session expired' });

    const sessionData = JSON.parse(cached);
    const questions: GeneratedQuestion[] = sessionData.questions;
    
    const question = questions.find(q => q.hash === questionHash);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const { generateHint } = await import('../services/hintService');
    const hintText = await generateHint(question.questionText, question.options);
    
    res.json({ hint: hintText });
  } catch (error) {
    console.error('Hint generation error:', error);
    res.status(500).json({ error: 'Failed to generate hint' });
  }
});

export default router;
