import Groq from 'groq-sdk';
import { createHash } from 'crypto';
import { redis } from '../lib/redis';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export interface GeneratedQuestion {
  hash: string;
  questionText: string;
  options: string[];      // always exactly 4
  correctAnswer: string;  // full text matching one of options
  explanation: string;
  difficulty: 1 | 2 | 3;
  subtopic: string;
}

const CACHE_TTL = 60 * 60 * 24; // 24 hours

function cacheKey(subtopic: string, difficulty: number, count: number): string {
  const norm = subtopic.toLowerCase().replace(/\s+/g, '_');
  return `q:${norm}:${difficulty}:${count}`;
}

export async function getQuestions(
  subtopic: string,
  difficulty: 1 | 2 | 3,
  count = 10
): Promise<GeneratedQuestion[]> {
  const key = cacheKey(subtopic, difficulty, count);
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const questions = await generateFromGroq(subtopic, difficulty, count);
  await redis.set(key, JSON.stringify(questions), 'EX', CACHE_TTL);
  return questions;
}

async function generateFromGroq(
  subtopic: string,
  difficulty: 1 | 2 | 3,
  count: number
): Promise<GeneratedQuestion[]> {
  const diffLabel = ['easy', 'medium', 'hard'][difficulty - 1];

  const chatCompletion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: 'You are a quiz question generator. You MUST respond with ONLY a valid JSON array. No markdown, no code fences, no explanations before or after the JSON.'
      },
      {
        role: 'user',
        content: `Generate ${count} ${diffLabel}-difficulty multiple choice questions about "${subtopic}".

Rules:
- Exactly 4 options per question (full text, not just A/B/C/D labels)
- correctAnswer must be the EXACT string of one of the options
- explanation: 1-2 sentences explaining why the answer is correct
- Questions must be factually accurate and unambiguous
- Mix question types: definitions, application, conceptual

Return ONLY a valid JSON array:
[{"questionText":"...","options":["...","...","...","..."],"correctAnswer":"...","explanation":"...","difficulty":${difficulty},"subtopic":"${subtopic}"}]`
      }
    ],
  });

  const raw = (chatCompletion.choices[0]?.message?.content || '').trim();

  // Strip markdown code fences if present
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const parsed = JSON.parse(clean);

  return parsed.map((q: Omit<GeneratedQuestion, 'hash'>) => ({
    ...q,
    hash: createHash('sha256').update(q.questionText).digest('hex').slice(0, 16),
  }));
}

export async function invalidateCache(subtopic: string) {
  const pattern = `q:${subtopic.toLowerCase().replace(/\s+/g, '_')}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}
