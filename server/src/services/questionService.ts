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
  count: number,
  retries = 3
): Promise<GeneratedQuestion[]> {
  const diffLabel = ['easy', 'medium', 'hard'][difficulty - 1];
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
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

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch (e) {
        throw new Error(`Failed to parse JSON: ${clean.substring(0, 100)}...`);
      }

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not a JSON array');
      }

      const validated = parsed.map((q: any, index: number) => {
        if (!q.questionText || !Array.isArray(q.options) || q.options.length !== 4 || !q.correctAnswer || !q.explanation) {
           throw new Error(`Invalid question format at index ${index}`);
        }
        if (!q.options.includes(q.correctAnswer)) {
           // Auto-fix or throw? Let's just throw for retry
           throw new Error(`correctAnswer not found in options at index ${index}`);
        }
        return {
          questionText: String(q.questionText),
          options: q.options.map(String),
          correctAnswer: String(q.correctAnswer),
          explanation: String(q.explanation),
          difficulty: Number(q.difficulty) || difficulty,
          subtopic: String(q.subtopic) || subtopic,
        };
      });

      return validated.map((q: any) => ({
        ...q,
        difficulty: q.difficulty as 1 | 2 | 3,
        hash: createHash('sha256').update(q.questionText).digest('hex').slice(0, 16),
      }));
      
    } catch (error: any) {
      lastError = error;
      console.warn(`[Generate] Attempt ${attempt} failed: ${error.message}`);
      if (attempt < retries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  throw new Error(`Failed to generate questions after ${retries} retries. Last error: ${lastError?.message}`);
}

export async function invalidateCache(subtopic: string) {
  const pattern = `q:${subtopic.toLowerCase().replace(/\s+/g, '_')}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}

export async function getRemedialProblems(subtopic: string): Promise<GeneratedQuestion[]> {
  const diffLabel = 'easy';
  const difficulty = 1;
  const count = 5;
  const key = `remedial:${subtopic.toLowerCase().replace(/\s+/g, '_')}`;
  
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const chatCompletion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 3000,
    messages: [
      {
        role: 'system',
        content: 'You are a quiz question generator. You MUST respond with ONLY a valid JSON array. No markdown, no code fences.'
      },
      {
        role: 'user',
        content: `Generate ${count} ${diffLabel}-difficulty MCQs about "${subtopic}" for a student who is struggling with this topic.

Rules:
- Start with the simplest possible version of each concept
- Each question should teach one clear thing
- Exactly 4 options per question (full text)
- correctAnswer must exactly match one of the options
- Explanations must be detailed (3-4 sentences) showing the complete method
- Include at least 1 conceptual and 1 basic application problem

Return ONLY a valid JSON array:
[{"questionText":"...","options":["...","...","...","..."],"correctAnswer":"...","explanation":"...","difficulty":1,"subtopic":"${subtopic}"}]`
      }
    ]
  });

  const raw = (chatCompletion.choices[0]?.message?.content || '').trim();
  const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(clean);

  const validated = parsed.map((q: any) => ({
    questionText: String(q.questionText),
    options: q.options.map(String),
    correctAnswer: String(q.correctAnswer),
    explanation: String(q.explanation),
    difficulty: 1 as const,
    subtopic: String(subtopic),
    hash: createHash('sha256').update(q.questionText).digest('hex').slice(0, 16),
  }));

  await redis.set(key, JSON.stringify(validated), 'EX', 6 * 3600); // 6 hours
  return validated;
}
