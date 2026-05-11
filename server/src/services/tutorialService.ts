import Groq from 'groq-sdk';
import { redis } from '../lib/redis';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export interface ConceptTutorial {
  title: string;
  introduction: string;
  keyConcepts: { term: string; explanation: string }[];
  examples: { description: string; code?: string }[];
  summary: string;
  readyMessage: string;
}

export interface QuickNotes {
  keyPoints: string[];
  funFact: string;
  gameTypeHint: string;
}

const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days (tutorials don't change often)

export async function getConceptTutorial(subtopic: string, difficultyLabel: string): Promise<ConceptTutorial> {
  const norm = subtopic.toLowerCase().replace(/\s+/g, '_');
  const cacheKey = `tutorial:${norm}:${difficultyLabel}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log(`📦 Cache HIT for tutorial: ${cacheKey}`);
    return JSON.parse(cached);
  }

  console.log(`🤖 Cache MISS — generating concept tutorial for "${subtopic}" (diff: ${difficultyLabel})`);

  const prompt = `
Generate an interactive concept tutorial for the topic "${subtopic}" at a "${difficultyLabel}" difficulty level.
This tutorial will be shown to a student right before they play an educational mini-game to test their knowledge.
Make it engaging, concise, and clear.

Return ONLY valid JSON matching this exact structure:
{
  "title": "A catchy title",
  "introduction": "A 2-3 sentence introduction to the core concept.",
  "keyConcepts": [
    { "term": "Concept Name", "explanation": "A clear explanation (1-2 sentences max)" }
  ],
  "examples": [
    { "description": "Example description", "code": "Optional code snippet or formula here (if not applicable, leave empty string)" }
  ],
  "summary": "A 1-sentence wrap-up.",
  "readyMessage": "A short, encouraging phrase to get them ready to play."
}

Rules:
- Generate exactly 3-5 key concepts.
- Generate 1-2 examples.
- Do NOT include any markdown formatting outside the JSON structure.
- Do NOT include markdown code fences (like \`\`\`json). Just the raw JSON object.
`;

  const chatCompletion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.5,
    max_tokens: 3000,
    messages: [
      {
        role: 'system',
        content: 'You are an expert tutor. You MUST respond with ONLY valid JSON.'
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const raw = (chatCompletion.choices[0]?.message?.content || '').trim();

  // Strip markdown code fences if present
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const tutorial: ConceptTutorial = JSON.parse(clean);

  await redis.set(cacheKey, JSON.stringify(tutorial), 'EX', CACHE_TTL);
  return tutorial;
}

export async function getQuickNotes(subtopic: string, gameType: string): Promise<QuickNotes> {
  const normSubtopic = subtopic.toLowerCase().replace(/\s+/g, '_');
  const normGame = gameType.toLowerCase().replace(/\s+/g, '_');
  const cacheKey = `quicknotes:${normSubtopic}:${normGame}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log(`📦 Cache HIT for quick notes: ${cacheKey}`);
    return JSON.parse(cached);
  }

  console.log(`🤖 Cache MISS — generating quick notes for "${subtopic}" (game: ${gameType})`);

  const prompt = `
You are an expert tutor. Provide a quick summary before a student plays a "${gameType}" game about "${subtopic}".

Return ONLY valid JSON matching this exact structure:
{
  "keyPoints": [
    "Short bullet point 1 (1 sentence max)",
    "Short bullet point 2 (1 sentence max)",
    "Short bullet point 3 (1 sentence max)"
  ],
  "funFact": "A fun, engaging trivia fact about this topic.",
  "gameTypeHint": "A 1-sentence hint on what to expect or how to succeed in a ${gameType} game about this topic."
}

Rules:
- Generate exactly 3-4 key points.
- Do NOT include any markdown formatting outside the JSON structure.
- Do NOT include markdown code fences (like \`\`\`json). Just the raw JSON object.
`;

  const chatCompletion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 1000,
    messages: [
      {
        role: 'system',
        content: 'You are an expert tutor. You MUST respond with ONLY valid JSON.'
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const raw = (chatCompletion.choices[0]?.message?.content || '').trim();

  // Strip markdown code fences if present
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const notes: QuickNotes = JSON.parse(clean);

  await redis.set(cacheKey, JSON.stringify(notes), 'EX', CACHE_TTL);
  return notes;
}
