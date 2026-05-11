import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getQuestions, GeneratedQuestion } from '../services/questionService';
import { getGameContent } from '../services/gameContentService';
import { redis } from '../lib/redis';
import { XP_RULES, awardXp, calculateMiniGameXp } from '../services/xpService';
import { updateDomainXpAndRank, checkLevelAdvancement } from '../services/domainService';
import { checkAchievements } from '../services/achievementService';

const router = Router();

// ── Available game types ──
const GAME_TYPES = [
  { type: 'MCQ', name: 'Classic Quiz', icon: '❓', description: 'Answer 10 multiple choice questions with a 30-second timer', xpBase: 'per-question' },
  { type: 'MEMORY_MATCH', name: 'Memory Match', icon: '🧠', description: 'Flip cards to match terms with their definitions', xpBase: 80 },
  { type: 'WORD_SCRAMBLE', name: 'Word Scramble', icon: '🔤', description: 'Unscramble letters to form key terms', xpBase: 90 },
  { type: 'CROSSWORD', name: 'Crossword', icon: '📝', description: 'Fill in a crossword puzzle with topic terms', xpBase: 120 },
  { type: 'HANGMAN', name: 'Hangman', icon: '💀', description: 'Guess letters to reveal key concepts', xpBase: 70 },
  { type: 'FILL_BLANK', name: 'Fill the Blank', icon: '⚡', description: 'Complete sentences with missing terms', xpBase: 85 },
  { type: 'CONCEPT_CANNON', name: 'Concept Cannon', icon: '🎯', description: 'Sort falling concepts into correct category buckets', xpBase: 100 },
];

// ── GET /games/arcade/:topicId ──
// Returns available game types for a topic
router.get('/arcade/:topicId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const topic = await prisma.topic.findUnique({ where: { id: req.params.topicId } });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    res.json({
      topicId: topic.id,
      topicName: topic.topic,
      subtopic: topic.subtopic,
      subject: topic.subject,
      games: GAME_TYPES,
    });
  } catch (error) {
    console.error('Arcade error:', error);
    res.status(500).json({ error: 'Failed to load arcade' });
  }
});

// ── GET /games/mini/:topicId/:gameType ──
// Generates mini-game content via LLM
router.get('/mini/:topicId/:gameType', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { topicId, gameType } = req.params;
    const difficulty = (parseInt(req.query.difficulty as string) || 2) as 1 | 2 | 3;

    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const validTypes = ['MEMORY_MATCH', 'WORD_SCRAMBLE', 'CROSSWORD', 'HANGMAN', 'FILL_BLANK', 'CONCEPT_CANNON'];
    if (!validTypes.includes(gameType)) {
      return res.status(400).json({ error: `Invalid game type. Must be one of: ${validTypes.join(', ')}` });
    }

    const content = await getGameContent(gameType, topic.subtopic, difficulty);

    // For answer-sensitive games, store answers server-side
    const sessionKey = `game_session:${req.userId}:${Date.now()}`;

    if (gameType === 'FILL_BLANK') {
      // Store full content with answers in Redis, send content without answers
      await redis.set(sessionKey, JSON.stringify(content), 'EX', 3600);
      const clientContent = {
        sentences: (content as any).sentences.map((s: any) => ({
          text: s.text,
          options: s.options,  // shuffled options are fine to send
          // blank (correct answer) is NOT sent
        })),
      };
      return res.json({ sessionKey, topicId, gameType, difficulty, content: clientContent, topicName: topic.topic, subtopic: topic.subtopic });
    }

    // For other games, send full content (answers are implicit in gameplay)
    await redis.set(sessionKey, JSON.stringify({ gameType, topicId, difficulty }), 'EX', 3600);
    res.json({ sessionKey, topicId, gameType, difficulty, content, topicName: topic.topic, subtopic: topic.subtopic });
  } catch (error) {
    console.error('Mini-game content error:', error);
    res.status(500).json({ error: 'Failed to generate game content' });
  }
});

// ── POST /games/mini/submit ──
// Submit mini-game results
router.post('/mini/submit', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { sessionKey, topicId, gameType, score, durationSec } = req.body;
    const userId = req.userId!;

    if (!sessionKey || !topicId || !gameType || score === undefined) {
      return res.status(400).json({ error: 'Missing required fields: sessionKey, topicId, gameType, score' });
    }

    // Verify session exists
    const sessionData = await redis.get(sessionKey);
    if (!sessionData) return res.status(400).json({ error: 'Session expired or invalid' });

    // Clamp score to 0-100
    const scorePercent = Math.max(0, Math.min(100, Math.round(score)));
    const isPerfect = scorePercent === 100;
    const isFast = (durationSec || 999) < 60; // under 1 min = fast

    const xpEarned = calculateMiniGameXp(gameType, scorePercent, isPerfect, isFast);

    // Create game session record
    await prisma.gameSession.create({
      data: {
        userId,
        topicId,
        gameType: gameType as any,
        difficulty: 2,
        score: scorePercent,
        xpEarned,
        durationSec: durationSec || 0,
      },
    });

    await awardXp(userId, xpEarned);

    // --- Domain Progression & Achievements ---
    let promotedTo = null;
    let levelAdvanced = false;
    let earnedAchievements = [];

    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (topic?.domainId) {
      const promotionResult = await updateDomainXpAndRank(userId, topic.domainId, xpEarned);
      promotedTo = promotionResult.promotedTo;
      levelAdvanced = await checkLevelAdvancement(userId, topic.domainId);
    }

    if (isPerfect) {
      await checkAchievements({ userId, type: 'perfect_score', data: {} });
    }
    if (isFast) {
      await checkAchievements({ userId, type: 'speed_run', data: { durationSec: durationSec || 0 } });
    }
    earnedAchievements = await checkAchievements({ 
      userId, 
      type: 'game_completed', 
      data: { gameType, score: scorePercent } 
    });

    // Clean up session
    await redis.del(sessionKey);

    res.json({
      score: scorePercent,
      xpEarned,
      gameType,
      isPerfect,
      isFast,
      promotedTo,
      levelAdvanced,
      earnedAchievements,
    });
  } catch (error) {
    console.error('Mini-game submit error:', error);
    res.status(500).json({ error: 'Failed to submit game results' });
  }
});

// ══════════════════════════════════════════
// EXISTING MCQ ROUTES (unchanged)
// ══════════════════════════════════════════

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

    const cached = await redis.get(sessionKey);
    if (!cached) return res.status(400).json({ error: 'Session expired' });

    const questions: GeneratedQuestion[] = JSON.parse(cached);
    const qMap = Object.fromEntries(questions.map(q => [q.hash, q]));

    let xp = 0;
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
        gameType: 'MCQ',
        difficulty: 2, 
        score, 
        xpEarned: xp, 
        durationSec: durationSec || 0, 
        attempts: { create: attempts } 
      },
    });

    await awardXp(userId, xp);

    // --- Domain Progression & Achievements ---
    let promotedTo = null;
    let levelAdvanced = false;
    let earnedAchievements = [];

    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (topic?.domainId) {
      const promotionResult = await updateDomainXpAndRank(userId, topic.domainId, xp);
      promotedTo = promotionResult.promotedTo;
      levelAdvanced = await checkLevelAdvancement(userId, topic.domainId);
    }

    if (score === 100) {
      await checkAchievements({ userId, type: 'perfect_score', data: {} });
    }
    if ((durationSec || 999) < 60) {
      await checkAchievements({ userId, type: 'speed_run', data: { durationSec: durationSec || 0 } });
    }
    earnedAchievements = await checkAchievements({ 
      userId, 
      type: 'game_completed', 
      data: { gameType: 'MCQ', score } 
    });

    res.json({
      score, 
      xpEarned: xp,
      promotedTo,
      levelAdvanced,
      earnedAchievements,
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

export default router;
