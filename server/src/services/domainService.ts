import { prisma } from '../lib/prisma';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function getUserDomainProgress(userId: string) {
  // Get all domains
  const domains = await prisma.domain.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  // Get user's progress for these domains
  const progressList = await prisma.userDomainProgress.findMany({
    where: { userId },
  });

  const progressMap = Object.fromEntries(progressList.map(p => [p.domainId, p]));

  // Combine
  return domains.map(domain => {
    const progress = progressMap[domain.id];
    return {
      ...domain,
      currentLevel: progress?.currentLevel || 1,
      totalXpInDomain: progress?.totalXpInDomain || 0,
      rank: progress?.rank || 'Bronze Coder',
      isStarted: !!progress,
    };
  });
}

export async function getDomainTopicsTree(userId: string, domainSlug: string) {
  const domain = await prisma.domain.findUnique({
    where: { slug: domainSlug },
    include: {
      topics: {
        orderBy: { levelOrder: 'asc' },
      },
    },
  });

  if (!domain) return null;

  const progress = await prisma.userDomainProgress.findUnique({
    where: { userId_domainId: { userId, domainId: domain.id } },
  });

  const currentLevel = progress?.currentLevel || 1;

  // Enhance topics with lock status and past performance
  const enhancedTopics = await Promise.all(
    domain.topics.map(async (topic) => {
      // Find past games on this topic
      const sessions = await prisma.gameSession.findMany({
        where: { userId, topicId: topic.id },
      });

      const gamesPlayed = sessions.length;
      const bestScore = gamesPlayed > 0 ? Math.max(...sessions.map(s => s.score)) : 0;
      const avgScore = gamesPlayed > 0 ? (sessions.reduce((a, b) => a + b.score, 0) / gamesPlayed) : 0;

      // Unlocked if the topic's level is <= user's current level
      // Exception: If currentLevel is 1, level 1 topics are unlocked
      const isUnlocked = topic.levelOrder <= currentLevel;
      const isCompleted = gamesPlayed > 0 && avgScore >= 70; // defined mastery as 70%+ avg

      return {
        ...topic,
        isUnlocked,
        isCompleted,
        gamesPlayed,
        bestScore,
        avgScore,
      };
    })
  );

  return {
    domain,
    progress: {
      currentLevel,
      totalXpInDomain: progress?.totalXpInDomain || 0,
      rank: progress?.rank || 'Bronze Coder',
    },
    topics: enhancedTopics,
  };
}

export async function checkLevelAdvancement(userId: string, domainId: string) {
  // Find current progress
  const progress = await prisma.userDomainProgress.findUnique({
    where: { userId_domainId: { userId, domainId } },
  });

  if (!progress) return false;

  // Check if all topics in currentLevel are completed (avg score >= 70)
  const topicsInCurrentLevel = await prisma.topic.findMany({
    where: { domainId, levelOrder: progress.currentLevel },
  });

  if (topicsInCurrentLevel.length === 0) return false; // No topics in level, can't advance

  let allCompleted = true;

  for (const topic of topicsInCurrentLevel) {
    const sessions = await prisma.gameSession.findMany({
      where: { userId, topicId: topic.id },
    });
    
    if (sessions.length === 0) {
      allCompleted = false;
      break;
    }

    const avgScore = sessions.reduce((a, b) => a + b.score, 0) / sessions.length;
    if (avgScore < 70) {
      allCompleted = false;
      break;
    }
  }

  // If completed, increment level
  if (allCompleted) {
    // Check if a higher level exists
    const nextLevelExists = await prisma.topic.findFirst({
      where: { domainId, levelOrder: progress.currentLevel + 1 },
    });

    if (nextLevelExists) {
      await prisma.userDomainProgress.update({
        where: { id: progress.id },
        data: { currentLevel: progress.currentLevel + 1 },
      });
      return true; // Advanced
    }
  }

  return false;
}

export async function updateDomainXpAndRank(userId: string, domainId: string, xpEarned: number) {
  const RANKS = [
    { threshold: 20000, rank: 'Grandmaster' },
    { threshold: 10000, rank: 'Diamond Legend' },
    { threshold: 5000,  rank: 'Platinum Master' },
    { threshold: 2000,  rank: 'Gold Architect' },
    { threshold: 500,   rank: 'Silver Problem Solver' },
    { threshold: 0,     rank: 'Bronze Coder' },
  ];

  let progress = await prisma.userDomainProgress.findUnique({
    where: { userId_domainId: { userId, domainId } },
  });

  if (!progress) {
    progress = await prisma.userDomainProgress.create({
      data: { userId, domainId, totalXpInDomain: xpEarned },
    });
  } else {
    progress = await prisma.userDomainProgress.update({
      where: { id: progress.id },
      data: { totalXpInDomain: { increment: xpEarned } },
    });
  }

  // Check for rank promotion
  const newRank = RANKS.find(r => progress!.totalXpInDomain >= r.threshold)?.rank || 'Bronze Coder';
  
  if (newRank !== progress.rank) {
    await prisma.userDomainProgress.update({
      where: { id: progress.id },
      data: { rank: newRank },
    });
    return { promotedTo: newRank };
  }

  return { promotedTo: null };
}

export async function generateCustomDomain(name: string, description: string = '') {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // 1. Check if domain already exists
  const existing = await prisma.domain.findUnique({
    where: { slug }
  });
  if (existing) {
    return existing; // Already exists
  }

  // 2. Generate content using Groq
  const prompt = `
Generate an educational domain structure for "${name}". 
Description context (if any): "${description}"

Return ONLY valid JSON matching this exact structure:
{
  "name": "Properly Capitalized Name",
  "description": "A 1-sentence description of the domain.",
  "icon": "A single relevant emoji",
  "topics": [
    {
      "topic": "Category Name",
      "subtopic": "Specific Concept",
      "levelOrder": 1
    },
    ... (generate 6 topics total, distributed across levels 1 to 4)
  ]
}

Rules:
- Generate 6 topics. At least one for each level 1, 2, 3, 4.
- Do NOT include markdown formatting. Just raw JSON.
`;

  const chatCompletion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 1500,
    messages: [
      { role: 'system', content: 'You are an expert curriculum designer. Return ONLY valid JSON.' },
      { role: 'user', content: prompt }
    ],
  });

  const raw = (chatCompletion.choices[0]?.message?.content || '').trim();
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
  
  const parsed = JSON.parse(clean);

  // Assign a random color
  const colors = ['#4F46E5', '#DC2626', '#059669', '#7C3AED', '#D97706', '#2563EB', '#DB2777', '#0D9488'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  // 3. Save to database
  const newDomain = await prisma.domain.create({
    data: {
      slug,
      name: parsed.name || name,
      description: parsed.description,
      icon: parsed.icon || '📚',
      color,
      sortOrder: 999, // Put at end
      topics: {
        create: parsed.topics.map((t: any) => ({
          subject: parsed.name || name,
          topic: t.topic,
          subtopic: t.subtopic,
          levelOrder: t.levelOrder
        }))
      }
    }
  });

  return newDomain;
}
