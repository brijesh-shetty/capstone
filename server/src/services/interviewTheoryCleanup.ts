import { prisma } from '../lib/prisma';
import Groq from 'groq-sdk';
import { redis } from '../lib/redis';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function cleanupTheory(topicId: string) {
  const theory = await prisma.interviewTheory.findUnique({
    where: { topicId },
    include: { topic: true }
  });

  if (!theory) {
    throw new Error('Theory not found');
  }

  const prompt = `You are an expert aptitude and reasoning educator. Your task is to clean up OCR artifacts, fix truncated sentences, separate mixed concepts, and properly format the raw study notes provided.

Topic: ${theory.topic.name}

Raw Notes to clean:
${theory.rawTheory.substring(0, 4000)} // Truncate if too long to save tokens

Instructions:
1. Extract the most important "keyPoints" (array of strings). Fix broken sentences.
2. Extract actual mathematical or logical "formulas" (array of strings). Do NOT include examples in the formulas array.
3. Structure the rest of the text into "tutorialSections", where each section has a "heading" and "content" (an array of string paragraphs/points). Group solved examples under a "Solved Examples" heading.
4. Correct any obvious OCR errors (e.g. *jp -> √p, etc).

Return ONLY a valid JSON object matching this structure exactly (no markdown, no other text):
{
  "keyPoints": ["point 1", "point 2"],
  "formulas": ["formula 1", "formula 2"],
  "tutorialSections": [
    {
      "heading": "Section Heading",
      "content": ["paragraph 1", "paragraph 2"]
    }
  ]
}
`;

  const chatCompletion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.2,
    max_tokens: 4000,
    messages: [
      {
        role: 'system',
        content: 'You are a precise data cleaner that only outputs valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const raw = (chatCompletion.choices[0]?.message?.content || '').trim();
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    console.error('Failed to parse Groq response:', clean);
    throw new Error('Failed to parse cleaned theory');
  }

  // Update DB
  await prisma.interviewTheory.update({
    where: { id: theory.id },
    data: {
      keyPoints: parsed.keyPoints || [],
      formulas: parsed.formulas || [],
      tutorialSections: parsed.tutorialSections || [],
      cleanedAt: new Date()
    }
  });

  return parsed;
}
