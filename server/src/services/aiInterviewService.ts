import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { chat, extractJson, ChatMessage } from './llmService';

// Conversational mock interview backed by AiInterview/AiInterviewTurn.
// Prompts live in server/ai/prompts/*.md so they can be edited without
// touching code. Scoring is rubric-based with defensive JSON parsing.

const MAX_QUESTIONS = 6;
const PROMPT_DIR = path.join(__dirname, '..', '..', 'ai', 'prompts');

const RUBRIC_WEIGHTS: Record<string, number> = {
  technical: 0.3,
  problemSolving: 0.25,
  communication: 0.2,
  structure: 0.15,
  roleFit: 0.1,
};

function loadPrompt(name: string, vars: Record<string, string | number>): string {
  let text = fs.readFileSync(path.join(PROMPT_DIR, `${name}.md`), 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, String(value));
  }
  return text;
}

async function loadInterview(interviewId: string, userId: string) {
  const interview = await prisma.aiInterview.findUnique({
    where: { id: interviewId },
    include: { turns: { orderBy: { order: 'asc' } }, company: true },
  });
  if (!interview || interview.userId !== userId) throw new Error('Interview not found');
  return interview;
}

function transcriptMessages(turns: { role: string; content: string }[]): ChatMessage[] {
  // interviewer = assistant, candidate = user (from the LLM's point of view)
  return turns.map((t) => ({
    role: t.role === 'INTERVIEWER' ? ('assistant' as const) : ('user' as const),
    content: t.content,
  }));
}

async function nextInterviewerTurn(interview: {
  id: string;
  role: string;
  company: { name: string; profile?: any } | null;
  turns: { role: string; content: string; order: number }[];
}) {
  const questionNumber = interview.turns.filter((t) => t.role === 'INTERVIEWER').length + 1;
  const styleNotes =
    (interview.company?.profile as any)?.interviewStyle ||
    'No company-specific notes — use a general professional style.';
  const system = loadPrompt('interviewer', {
    role: interview.role,
    company: interview.company?.name || 'a top tech company',
    maxQuestions: MAX_QUESTIONS,
    questionNumber: Math.min(questionNumber, MAX_QUESTIONS),
    styleNotes,
  });

  const history = transcriptMessages(interview.turns);
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...(history.length > 0 ? history : [{ role: 'user' as const, content: 'Hi, I am ready to begin.' }]),
  ];

  const content = (await chat(messages, { maxTokens: 400 })).trim();
  const turn = await prisma.aiInterviewTurn.create({
    data: {
      interviewId: interview.id,
      role: 'INTERVIEWER',
      content,
      order: interview.turns.length,
    },
  });
  return turn;
}

export async function startInterview(userId: string, role: string, companyId?: string) {
  if (!role?.trim()) throw new Error('role is required');
  const interview = await prisma.aiInterview.create({
    data: { userId, role: role.trim(), companyId: companyId || null },
    include: { turns: true, company: true },
  });
  await nextInterviewerTurn({ ...interview, turns: [] });
  return getInterview(interview.id, userId);
}

export async function reply(interviewId: string, userId: string, content: string) {
  if (!content?.trim()) throw new Error('Empty answer');
  const interview = await loadInterview(interviewId, userId);
  if (interview.status !== 'IN_PROGRESS') throw new Error('Interview already finished');

  // out-of-turn guard: a candidate turn must follow an interviewer turn, so a
  // duplicated/raced client submit can never corrupt the transcript
  const lastTurn = interview.turns[interview.turns.length - 1];
  if (lastTurn && lastTurn.role === 'CANDIDATE') {
    throw new Error('Please wait for the next question');
  }

  await prisma.aiInterviewTurn.create({
    data: {
      interviewId,
      role: 'CANDIDATE',
      content: content.trim().slice(0, 4000),
      order: interview.turns.length,
    },
  });

  const updated = await loadInterview(interviewId, userId);
  const questionsAsked = updated.turns.filter((t) => t.role === 'INTERVIEWER').length;
  await nextInterviewerTurn(updated);

  // after the closing message that follows the final answered question,
  // score the interview automatically
  if (questionsAsked >= MAX_QUESTIONS) {
    return finishInterview(interviewId, userId);
  }
  return getInterview(interviewId, userId);
}

export async function finishInterview(interviewId: string, userId: string) {
  const interview = await loadInterview(interviewId, userId);
  if (interview.status !== 'IN_PROGRESS') return getInterview(interviewId, userId);

  const candidateTurns = interview.turns.filter((t) => t.role === 'CANDIDATE');
  if (candidateTurns.length === 0) {
    await prisma.aiInterview.update({
      where: { id: interviewId },
      data: { status: 'ABANDONED', endedAt: new Date() },
    });
    return getInterview(interviewId, userId);
  }

  const transcript = interview.turns
    .map((t) => `[${t.order}] ${t.role}: ${t.content}`)
    .join('\n\n');
  const prompt = loadPrompt('scorer', {
    role: interview.role,
    company: interview.company?.name || 'a top tech company',
    transcript,
  });

  const raw = await chat([{ role: 'user', content: prompt }], { json: true, maxTokens: 2000 });
  const parsed = extractJson<{
    rubricScores: Record<string, number>;
    turnFeedback: { turnOrder: number; score: number; feedback: string }[];
    summary: { strengths: string[]; gaps: string[]; nextSteps: string[] };
  }>(raw);

  let rubricScores: Record<string, number> = {};
  let summary: any = null;
  let overall: number | null = null;

  if (parsed?.rubricScores) {
    const clamp = (v: any) => Math.max(0, Math.min(5, Number(v) || 0));
    for (const key of Object.keys(RUBRIC_WEIGHTS)) rubricScores[key] = clamp(parsed.rubricScores[key]);
    overall =
      Math.round(
        Object.entries(RUBRIC_WEIGHTS).reduce(
          (sum, [key, w]) => sum + (rubricScores[key] / 5) * w * 100,
          0
        ) * 10
      ) / 10;
    summary = parsed.summary ?? null;

    for (const fb of parsed.turnFeedback || []) {
      const turn = interview.turns.find((t) => t.order === fb.turnOrder && t.role === 'CANDIDATE');
      if (turn) {
        await prisma.aiInterviewTurn.update({
          where: { id: turn.id },
          data: { turnScore: clamp(fb.score), feedback: String(fb.feedback || '').slice(0, 1000) },
        });
      }
    }
  }

  await prisma.aiInterview.update({
    where: { id: interviewId },
    data: {
      status: 'COMPLETED',
      endedAt: new Date(),
      overallScore: overall,
      rubricScores: rubricScores as any,
      summary: summary ? JSON.stringify(summary) : null,
    },
  });
  return getInterview(interviewId, userId);
}

// Face-presence event counts observed during a video interview. Stored as a
// triage signal for the report — never a verdict.
const PROCTORING_KEYS = new Set(['FACE_NOT_DETECTED', 'MULTIPLE_FACES', 'NO_CAMERA', 'faceChecks']);

export async function recordProctoringSummary(
  interviewId: string,
  userId: string,
  counts: Record<string, number>
) {
  const interview = await loadInterview(interviewId, userId);
  const clean: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts || {})) {
    if (PROCTORING_KEYS.has(key)) clean[key] = Math.max(0, Math.min(10000, Number(value) || 0));
  }
  await prisma.aiInterview.update({
    where: { id: interview.id },
    data: { proctoringSummary: clean as any },
  });
  return { ok: true };
}

export async function getInterview(interviewId: string, userId: string) {
  const interview = await loadInterview(interviewId, userId);
  return {
    id: interview.id,
    role: interview.role,
    company: interview.company?.name ?? null,
    status: interview.status,
    startedAt: interview.startedAt,
    endedAt: interview.endedAt,
    overallScore: interview.overallScore,
    rubricScores: interview.rubricScores,
    summary: interview.summary ? JSON.parse(interview.summary) : null,
    proctoringSummary: interview.proctoringSummary ?? null,
    maxQuestions: MAX_QUESTIONS,
    turns: interview.turns.map((t) => ({
      order: t.order,
      role: t.role,
      content: t.content,
      turnScore: t.turnScore,
      feedback: t.feedback,
    })),
  };
}

export async function listInterviews(userId: string) {
  const interviews = await prisma.aiInterview.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: {
      id: true, role: true, status: true, startedAt: true, overallScore: true,
      company: { select: { name: true } },
    },
  });
  return interviews;
}
