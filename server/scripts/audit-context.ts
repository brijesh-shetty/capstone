import 'dotenv/config';
import Groq from 'groq-sdk';
import { prisma } from '../src/lib/prisma';

// Audits every text question for self-containedness using Gemini.
// The extractor attaches shared Directions/passage blocks as assets.context,
// but some grouped questions (blood relations, DI sets, RC) lost theirs —
// students then see "How is A related to B?" with no statements about A and B.
//
// Each question is classified as:
//   SELF_CONTAINED — answerable exactly as shown (stem + context + options)
//   NEEDS_CONTEXT  — references data/entities/passages not present
//   NEEDS_FIGURE   — needs a diagram the text doesn't convey
//   INCOMPLETE     — stem or options are truncated/garbled
//
// Result is stored in assets.audit = { status, reason, model, at }.
// Non-SELF_CONTAINED questions must be excluded from solving and from
// student-facing selection until fixed in the review queue.
//
// Usage: npx ts-node scripts/audit-context.ts [--limit N] [--redo] [--batch N] [--provider gemini|groq]
// Resumable: questions with assets.audit are skipped unless --redo is given.

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_FALLBACK_MODEL = 'llama-3.1-8b-instant';
const STATUSES = ['SELF_CONTAINED', 'NEEDS_CONTEXT', 'NEEDS_FIGURE', 'INCOMPLETE'] as const;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = flag('limit') ? parseInt(flag('limit')!, 10) : undefined;
const BATCH = flag('batch') ? parseInt(flag('batch')!, 10) : 8;
const REDO = args.includes('--redo');
const PROVIDER = (flag('provider') || 'gemini') as 'gemini' | 'groq';
const MODEL = PROVIDER === 'gemini' ? GEMINI_MODEL : GROQ_MODEL;

const groq =
  PROVIDER === 'groq' ? new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 90_000, maxRetries: 0 }) : null;
let groqModel = GROQ_MODEL;

// Groq free tier: retry 429s with the server-suggested delay; drop to the
// 8b model if the 70b daily token quota runs out.
async function groqCall(prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await groq!.chat.completions.create({
        model: groqModel,
        temperature: 0,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You audit exam questions for completeness. Respond ONLY with a JSON object of the form {"results": [...]} where results is the array described by the user.',
          },
          { role: 'user', content: prompt },
        ],
      });
      return response.choices[0]?.message?.content || '';
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (e?.status === 429 || msg.includes('rate_limit')) {
        if (msg.includes('per day') || msg.includes('TPD') || msg.includes('tokens per day')) {
          if (groqModel !== GROQ_FALLBACK_MODEL) {
            console.log(`  70b daily quota exhausted — falling back to ${GROQ_FALLBACK_MODEL}`);
            groqModel = GROQ_FALLBACK_MODEL;
            continue;
          }
        }
        const m = msg.match(/try again in ([\d.]+m)?([\d.]+)s/);
        const waitMs = m
          ? (m[1] ? parseFloat(m[1]) * 60_000 : 0) + Math.ceil(parseFloat(m[2]) * 1000) + 1000
          : 20_000;
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 120_000)));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Groq: exhausted retries on rate limits');
}

// Free tier allows ~10 requests/min in practice — keep a global minimum
// interval between calls and retry patiently on 429/503.
const MIN_INTERVAL_MS = 7000;
let lastCallAt = 0;

async function geminiCall(prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': process.env.GEMINI_API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );

    if (res.status === 429 || res.status === 503) {
      const body = await res.text();
      const m = body.match(/"retryDelay":\s*"(\d+)s"/);
      const delayMs = m ? (parseInt(m[1], 10) + 2) * 1000 : 30_000;
      console.log(`  rate limited (${res.status}) — waiting ${Math.round(delayMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const data: any = await res.json();
    return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  }
  throw new Error('Gemini: exhausted retries on rate limits');
}

function renderQuestion(q: any, n: number): string {
  const a = q.assets as any;
  const ctx = a?.context ? `Context/Directions: ${a.context}\n` : '';
  const opts = [...q.options]
    .sort((x: any, y: any) => x.order - y.order)
    .map((o: any, i: number) => `${LETTERS[i]}. ${o.text}`)
    .join('  ');
  return `--- Question ${n} (topic: ${q.topic.name}) ---\n${ctx}Stem: ${q.stem}\nOptions: ${opts}`;
}

const INSTRUCTIONS = `You are auditing exam questions extracted from a PDF for completeness.
For EACH question below, decide whether a student could answer it using ONLY the text shown.

Statuses:
- SELF_CONTAINED: everything needed is present.
- NEEDS_CONTEXT: the stem references information that is NOT shown — e.g. named people/entities with no defining statements ("How is A related to B?" with no relationship facts), "the above data/table/passage", a data set shared by a question group, or a reading passage. If a Context/Directions block IS shown and contains the needed facts, the question is SELF_CONTAINED.
- NEEDS_FIGURE: the question depends on a diagram/figure/image that text cannot convey.
- INCOMPLETE: the stem or options are visibly truncated, garbled, or missing.

Judge ONLY completeness — do not judge difficulty or correctness. A pure-math question that states all its numbers is SELF_CONTAINED even if hard.

Respond with a JSON array, one object per question, in the same order:
[{"n": <question number>, "status": "<one of the four>", "reason": "<short reason, <=15 words>"}]`;

function parseResults(text: string, expected: number[]): Map<number, { status: string; reason: string }> {
  const out = new Map<number, { status: string; reason: string }>();
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return out;
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return out;
    for (const item of arr) {
      const n = Number(item?.n);
      const status = String(item?.status || '').toUpperCase();
      if (expected.includes(n) && (STATUSES as readonly string[]).includes(status)) {
        out.set(n, { status, reason: String(item?.reason || '').slice(0, 200) });
      }
    }
  } catch {
    // unparseable — caller treats missing entries as failed
  }
  return out;
}

async function main() {
  const keyVar = PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY';
  if (!process.env[keyVar]) {
    console.error(`${keyVar} is not set in server/.env — aborting.`);
    process.exit(1);
  }

  const questions = await prisma.assessmentQuestion.findMany({
    where: { type: 'SINGLE' },
    include: { options: true, topic: true },
    orderBy: { createdAt: 'asc' },
  });

  // figure/incomplete questions are already excluded elsewhere — audit the rest
  const queue = questions.filter((q) => {
    const a = q.assets as any;
    if (a?.requiresImage || a?.incompleteOptions) return false;
    if (!REDO && a?.audit) return false;
    return true;
  });
  const work = LIMIT ? queue.slice(0, LIMIT) : queue;

  console.log(`Auditing ${work.length} questions with ${MODEL} (batch ${BATCH}, ~${Math.ceil(work.length / BATCH)} calls)`);

  const counts: Record<string, number> = {};
  let failed = 0;

  for (let i = 0; i < work.length; i += BATCH) {
    const batch = work.slice(i, i + BATCH);
    const nums = batch.map((_, j) => i + j + 1);
    const prompt =
      INSTRUCTIONS +
      '\n\n' +
      batch.map((q, j) => renderQuestion(q, nums[j])).join('\n\n');

    let results: Map<number, { status: string; reason: string }>;
    try {
      const raw = PROVIDER === 'groq' ? await groqCall(prompt) : await geminiCall(prompt);
      results = parseResults(raw, nums);
    } catch (e: any) {
      console.error(`  batch at ${i} failed: ${e.message}`);
      failed += batch.length;
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const q = batch[j];
      const r = results.get(nums[j]);
      if (!r) {
        failed++;
        continue;
      }
      counts[r.status] = (counts[r.status] || 0) + 1;
      await prisma.assessmentQuestion.update({
        where: { id: q.id },
        data: {
          assets: {
            ...((q.assets as any) || {}),
            audit: {
              status: r.status,
              reason: r.reason,
              model: PROVIDER === 'groq' ? groqModel : MODEL,
              at: new Date().toISOString(),
            },
          },
        },
      });
    }
    const done = Math.min(i + BATCH, work.length);
    if (done % 80 < BATCH || done === work.length) {
      console.log(`  progress: ${done}/${work.length}  ${JSON.stringify(counts)}`);
    }
  }

  console.log('\n=== context audit report ===');
  console.log(`classified: ${JSON.stringify(counts)}  failed: ${failed}`);
  console.log('Non-SELF_CONTAINED questions should stay unverified and be fixed via the review queue.');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('audit-context failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
