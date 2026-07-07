import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { prisma } from '../src/lib/prisma';

// Solves unverified text-only MCQs with two independent LLM passes.
// Agreement  -> Option.isCorrect set, explanation stored, verified=true.
// Disagreement -> stays unverified, both proposals recorded for the review queue.
//
// Provider: Anthropic (claude-opus-4-8) when ANTHROPIC_API_KEY is set.
// Otherwise, when GEMINI_API_KEY is set, pass A runs on Gemini and pass B on
// Groq (llama-3.3-70b) — agreement across two independent model families.
// With only GROQ_API_KEY, both passes run on Groq (weakest configuration).
// Disagreements always land in the human review queue.
//
// Usage:
//   npx ts-node scripts/solve-and-verify.ts [--limit N] [--topic slug] [--concurrency N] [--redo]
//
// Resumable: questions with a proposedAnswer are skipped unless --redo is given.

const ANTHROPIC_MODEL = 'claude-opus-4-8';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = flag('limit') ? parseInt(flag('limit')!, 10) : undefined;
const TOPIC = flag('topic');
const CONCURRENCY = flag('concurrency') ? parseInt(flag('concurrency')!, 10) : 4;
const REDO = args.includes('--redo');

const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
const useGemini = !useAnthropic && !!process.env.GEMINI_API_KEY;
const MODEL = useAnthropic ? ANTHROPIC_MODEL : GROQ_MODEL;
const anthropic = useAnthropic ? new Anthropic() : null;
const groq = !useAnthropic
  ? new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 60_000, maxRetries: 2 })
  : null;

// Gemini free tier is 15 requests/min — global minimum interval between calls.
const GEMINI_MIN_INTERVAL_MS = 4500;
let geminiLastCallAt = 0;
let geminiGate: Promise<void> = Promise.resolve();

async function geminiSolve(prompt: string, framing: string): Promise<SolveResult | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    // serialize slot acquisition so concurrent workers respect the interval
    let release!: () => void;
    const prev = geminiGate;
    geminiGate = new Promise((r) => (release = r));
    await prev;
    const wait = geminiLastCallAt + GEMINI_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    geminiLastCallAt = Date.now();
    release();

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': process.env.GEMINI_API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${framing}\n\nRespond ONLY with a JSON object: {"answer": "<letter A-E of the correct option>", "explanation": "<concise step-by-step solution>"}\n\n${prompt}`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );

    if (res.status === 429 || res.status === 503) {
      const body = await res.text();
      const m = body.match(/"retryDelay":\s*"(\d+)s"/);
      const delayMs = m ? (parseInt(m[1], 10) + 2) * 1000 : 30_000;
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);

    const data: any = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    return parseAnswer(text);
  }
  return null;
}

const ANSWER_SCHEMA = {
  type: 'object' as const,
  properties: {
    answer: { type: 'string', enum: LETTERS, description: 'Letter of the correct option' },
    explanation: {
      type: 'string',
      description: 'Concise step-by-step worked solution, including any formula used',
    },
  },
  required: ['answer', 'explanation'],
  additionalProperties: false,
};

interface SolveResult {
  answer: string;
  explanation: string;
}

function parseAnswer(text: string): SolveResult | null {
  try {
    // tolerate code fences / surrounding prose around the JSON object
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.answer === 'string' && LETTERS.includes(parsed.answer.toUpperCase())) {
      return { answer: parsed.answer.toUpperCase(), explanation: String(parsed.explanation || '') };
    }
  } catch {
    // fall through
  }
  return null;
}

async function solveOnce(prompt: string, framing: string, temperature = 0): Promise<SolveResult | null> {
  if (anthropic) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
      messages: [{ role: 'user', content: `${framing}\n\n${prompt}` }],
    } as any);
    const text = (response as any).content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    return parseAnswer(text);
  }

  // Groq free tier: 12k tokens/min — retry 429s with the server-suggested delay
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const response = await groq!.chat.completions.create({
        model: MODEL,
        temperature,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You solve multiple-choice aptitude questions. Respond ONLY with a JSON object: ' +
              '{"answer": "<letter A-E of the correct option>", "explanation": "<brief solution, max 4 sentences>"}',
          },
          { role: 'user', content: `${framing}\n\n${prompt}` },
        ],
      });
      return parseAnswer(response.choices[0]?.message?.content || '');
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (e?.status === 429 || msg.includes('rate_limit')) {
        const m = msg.match(/try again in ([\d.]+)s/);
        const waitMs = m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : 15000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (msg.includes('json_validate_failed')) return null; // model rambled — count as failed pass
      throw e;
    }
  }
  return null;
}

function buildPrompt(q: {
  stem: string;
  assets: any;
  options: { text: string; order: number }[];
}): string {
  const context = q.assets?.context ? `Context/Directions:\n${q.assets.context}\n\n` : '';
  const opts = [...q.options]
    .sort((a, b) => a.order - b.order)
    .map((o, i) => `${LETTERS[i]}. ${o.text}`)
    .join('\n');
  return `${context}Question:\n${q.stem}\n\nOptions:\n${opts}`;
}

async function processQuestion(q: any): Promise<'verified' | 'disagreed' | 'failed'> {
  const prompt = buildPrompt(q);

  // With Gemini available, pass A runs on Gemini and pass B on Groq — two
  // independent model families must agree. Otherwise pass B only differs by
  // framing (and temperature on Groq).
  const framingA =
    'You are an expert aptitude exam solver. Solve the following multiple-choice question carefully and pick the single correct option.';
  const [passA, passB] = await Promise.all([
    useGemini ? geminiSolve(prompt, framingA) : solveOnce(prompt, framingA, 0),
    solveOnce(
      prompt,
      'You are a meticulous exam verifier. Independently re-derive the answer to this multiple-choice question from first principles, then eliminate the wrong options one by one before choosing.',
      0.5
    ),
  ]);

  if (!passA || !passB) return 'failed';

  const sorted = [...q.options].sort((a: any, b: any) => a.order - b.order);
  const idxA = LETTERS.indexOf(passA.answer);

  if (passA.answer === passB.answer && idxA >= 0 && idxA < sorted.length) {
    await prisma.$transaction([
      prisma.assessmentOption.updateMany({
        where: { questionId: q.id },
        data: { isCorrect: false },
      }),
      prisma.assessmentOption.update({
        where: { id: sorted[idxA].id },
        data: { isCorrect: true },
      }),
      prisma.assessmentQuestion.update({
        where: { id: q.id },
        data: {
          proposedAnswer: passA.answer,
          explanation: passA.explanation,
          verified: true,
        },
      }),
    ]);
    return 'verified';
  }

  // disagreement — keep unverified, surface both proposals to the review queue
  await prisma.assessmentQuestion.update({
    where: { id: q.id },
    data: {
      proposedAnswer: passA.answer,
      explanation: passA.explanation,
      assets: { ...(q.assets || {}), solverDisagreement: [passA.answer, passB.answer] },
    },
  });
  return 'disagreed';
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY) {
    console.error('Neither ANTHROPIC_API_KEY nor GROQ_API_KEY is set in server/.env — aborting.');
    process.exit(1);
  }
  const providerDesc = useAnthropic
    ? `Anthropic (${MODEL}) x2 passes`
    : useGemini
      ? `Gemini (${GEMINI_MODEL}) + Groq (${GROQ_MODEL}) cross-model`
      : `Groq (${MODEL}) x2 passes`;
  console.log(`Provider: ${providerDesc}`);

  const questions = await prisma.assessmentQuestion.findMany({
    where: {
      verified: false,
      type: 'SINGLE',
      ...(REDO ? {} : { proposedAnswer: null }),
      ...(TOPIC ? { topic: { slug: TOPIC } } : {}),
    },
    include: { options: true, topic: true },
    orderBy: { createdAt: 'asc' },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  // text-only, complete, self-contained questions only — figures, short option
  // sets, and audit-flagged items (missing context etc.) go to humans
  const solvable = questions.filter((q) => {
    const a = q.assets as any;
    if (a?.requiresImage || a?.incompleteOptions || q.options.length < 3) return false;
    if (a?.audit && a.audit.status !== 'SELF_CONTAINED') return false;
    return true;
  });

  console.log(`Queue: ${solvable.length} solvable unverified questions (model: ${MODEL}, 2 passes each)`);

  let verified = 0;
  let disagreed = 0;
  let failed = 0;
  let done = 0;

  const queue = [...solvable];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const q = queue.shift()!;
      try {
        const result = await processQuestion(q);
        if (result === 'verified') verified++;
        else if (result === 'disagreed') disagreed++;
        else failed++;
      } catch (e: any) {
        failed++;
        console.error(`  error on ${q.topic.slug} q${(q.assets as any)?.handoutNumber}: ${e.message}`);
      }
      done++;
      if (done % 25 === 0) console.log(`  progress: ${done}/${solvable.length}`);
    }
  });
  await Promise.all(workers);

  const totals = {
    verified: await prisma.assessmentQuestion.count({ where: { verified: true } }),
    unverified: await prisma.assessmentQuestion.count({ where: { verified: false } }),
  };

  console.log('\n=== solve-and-verify report ===');
  console.log(`this run:   ${verified} verified, ${disagreed} disagreements, ${failed} failed`);
  console.log(`DB totals:  ${totals.verified} verified / ${totals.unverified} need review or images`);
  console.log('Disagreements + failures stay unverified — resolve them in the admin review queue.');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('solve-and-verify failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
