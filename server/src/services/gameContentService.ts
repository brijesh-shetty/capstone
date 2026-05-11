import Groq from 'groq-sdk';
import { redis } from '../lib/redis';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ── Interfaces ──

export interface MemoryMatchContent {
  pairs: { term: string; definition: string }[];
}

export interface WordScrambleContent {
  words: { original: string; hint: string }[];
}

export interface CrosswordClue {
  clue: string;
  answer: string;
}

export interface CrosswordContent {
  clues: CrosswordClue[];
}

export interface HangmanContent {
  words: { word: string; hint: string; category: string }[];
}

export interface FillBlankContent {
  sentences: { text: string; blank: string; options: string[] }[];
}

export interface ConceptCannonContent {
  categories: string[];
  items: { concept: string; category: string }[];
}

export type GameContent =
  | MemoryMatchContent
  | WordScrambleContent
  | CrosswordContent
  | HangmanContent
  | FillBlankContent
  | ConceptCannonContent;

const CACHE_TTL = 60 * 60 * 24; // 24 hours

function gameCacheKey(gameType: string, subtopic: string, difficulty: number): string {
  const norm = subtopic.toLowerCase().replace(/\s+/g, '_');
  return `game:${gameType.toLowerCase()}:${norm}:${difficulty}`;
}

// ── Prompt templates per game type ──

const PROMPTS: Record<string, (subtopic: string, diff: string) => string> = {
  MEMORY_MATCH: (subtopic, diff) =>
    `Generate 8 term-definition pairs about "${subtopic}" at ${diff} difficulty for a memory card matching game.
Rules:
- Terms should be 1-3 words, concise key concepts
- Definitions should be 5-15 words, clear and accurate
- All content must be factually correct
- Cover different aspects of the topic
Return ONLY valid JSON: {"pairs":[{"term":"...","definition":"..."}]}`,

  WORD_SCRAMBLE: (subtopic, diff) =>
    `Generate 10 important terms/concepts about "${subtopic}" at ${diff} difficulty for a word scramble game.
Rules:
- Each word should be a single word (no spaces, no hyphens), 4-12 letters
- Hint is a one-sentence clue that helps identify the word
- Words must be real, commonly used terms in this subject
- Vary difficulty: mix common and specialized terms
Return ONLY valid JSON: {"words":[{"original":"...","hint":"..."}]}`,

  CROSSWORD: (subtopic, diff) =>
    `Generate 8 crossword clue-answer pairs about "${subtopic}" at ${diff} difficulty.
Rules:
- Answers must be single words, NO spaces, NO hyphens, 4-10 letters
- Answers must be ALL UPPERCASE
- Clues should be concise (5-15 words)
- All answers must be real terms related to the topic
Return ONLY valid JSON: {"clues":[{"clue":"...","answer":"..."}]}`,

  HANGMAN: (subtopic, diff) =>
    `Generate 8 key terms about "${subtopic}" at ${diff} difficulty for a hangman guessing game.
Rules:
- Each word is a single word (no spaces), 4-12 letters
- Hint is a short clue (one sentence) to help guess the word
- Category is a sub-category within the topic
- All terms must be real and commonly known
Return ONLY valid JSON: {"words":[{"word":"...","hint":"...","category":"..."}]}`,

  FILL_BLANK: (subtopic, diff) =>
    `Generate 10 fill-in-the-blank sentences about "${subtopic}" at ${diff} difficulty.
Rules:
- Each sentence has exactly one blank shown as ___
- The blank field contains the correct answer
- Options array has exactly 4 choices including the correct answer (shuffled)
- Sentences should test key concepts
- All content must be factually accurate
Return ONLY valid JSON: {"sentences":[{"text":"The ___ is the basic unit of life.","blank":"cell","options":["cell","atom","molecule","organ"]}]}`,

  CONCEPT_CANNON: (subtopic, diff) =>
    `Generate a classification game about "${subtopic}" at ${diff} difficulty.
Rules:
- Create exactly 3 or 4 categories (sub-areas of the topic)
- Generate 15 concepts that each belong to exactly one category
- Categories should be distinct and non-overlapping
- Concepts should be 1-3 words each
- Distribution should be roughly equal across categories
Return ONLY valid JSON: {"categories":["Cat1","Cat2","Cat3"],"items":[{"concept":"...","category":"Cat1"}]}`,
};

export async function getGameContent(
  gameType: string,
  subtopic: string,
  difficulty: 1 | 2 | 3
): Promise<GameContent> {
  const key = gameCacheKey(gameType, subtopic, difficulty);
  const cached = await redis.get(key);
  if (cached) {
    console.log(`📦 Cache HIT for ${key}`);
    return JSON.parse(cached);
  }

  console.log(`🤖 Cache MISS — generating ${gameType} content for "${subtopic}" (difficulty ${difficulty})`);
  const diffLabel = ['easy', 'medium', 'hard'][difficulty - 1];
  const promptFn = PROMPTS[gameType];
  if (!promptFn) throw new Error(`Unknown game type: ${gameType}`);

  const chatCompletion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: 'You are an educational game content generator. You MUST respond with ONLY valid JSON. No markdown, no code fences, no explanations before or after the JSON.'
      },
      {
        role: 'user',
        content: promptFn(subtopic, diffLabel),
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

  const content = JSON.parse(clean);

  await redis.set(key, JSON.stringify(content), 'EX', CACHE_TTL);
  console.log(`✅ Cached ${gameType} content for "${subtopic}"`);
  return content;
}

export async function invalidateGameCache(gameType: string, subtopic: string) {
  const pattern = `game:${gameType.toLowerCase()}:${subtopic.toLowerCase().replace(/\s+/g, '_')}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length) await redis.del(...keys);
}
