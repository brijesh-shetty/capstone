import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { apiClient } from '../services/api';
import { useProctoring, enterFullscreen } from '../hooks/useProctoring';
import { SelfViewCamera } from '../components/SelfViewCamera';
import RichText from '../components/RichText';

// Student test runner: consent screen → sectioned navigator + server-synced
// countdown + debounced autosave → review grid → submit → scorecard.
// The server is authoritative for time and marks; this UI never grades.

interface Item {
  kind: 'question' | 'coding';
  id: string;
  sectionId: string;
  sectionTitle: string;
  sectionKind: string;
  marks: number;
  order: number;
  content: any;
}

interface AttemptPayload {
  attemptId: string;
  status: string;
  needsConsent?: boolean;
  test: {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    mode: 'PRACTICE' | 'PROCTORED';
    negativeMarking: number;
    passScore: number | null;
  };
  remainingSec: number;
  items: Item[];
  responses: { questionId: string | null; codingProblemId: string | null; answer: any; flagged: boolean }[];
}

type AnswerMap = Record<string, any>; // itemId -> answer (MCQ: optionId[], coding: {language, code})
type FlagMap = Record<string, boolean>;

const MONACO_LANG: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  cpp: 'cpp',
  java: 'java',
};

export const AssessmentRunner: React.FC<{
  testId: string;
  onExit: () => void;
  onPractice?: (testId: string) => void;
}> = ({ testId, onExit, onPractice }) => {
  const [payload, setPayload] = useState<AttemptPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'consent' | 'running' | 'review-grid' | 'result'>('consent');
  const [consented, setConsented] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [flags, setFlags] = useState<FlagMap>({});
  const [remaining, setRemaining] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [runOutput, setRunOutput] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const enteredAt = useRef<number>(Date.now());
  const submittingRef = useRef(false);

  const proctored = payload?.test.mode === 'PROCTORED';
  const proctoringActive = !!proctored && (phase === 'running' || phase === 'review-grid');
  const { warning: proctorWarning, cameraOn, faceStatus } = useProctoring(
    payload?.attemptId ?? null,
    proctoringActive
  );

  // ---- load / start attempt ----
  useEffect(() => {
    apiClient
      .post<AttemptPayload>(`/assessments/${testId}/start`, {})
      .then((p) => {
        setPayload(p);
        setRemaining(p.remainingSec);
        const a: AnswerMap = {};
        const f: FlagMap = {};
        for (const r of p.responses) {
          const id = r.questionId || r.codingProblemId!;
          if (r.answer != null) a[id] = r.answer;
          if (r.flagged) f[id] = true;
        }
        setAnswers(a);
        setFlags(f);
        if (p.status !== 'IN_PROGRESS') {
          // already submitted/expired — jump straight to the result
          apiClient
            .get(`/assessments/attempts/${p.attemptId}/review`)
            .then((r) => {
              setResult(r);
              setPhase('result');
            })
            .catch(() => setError('Attempt already closed; failed to load review.'));
        } else if (p.responses.length > 0 && !p.needsConsent) {
          setPhase('running'); // resuming — consent was already given
        }
      })
      .catch((e) => setError(e?.message || 'Failed to start the test'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  // ---- countdown (server-synced via autosave responses) ----
  useEffect(() => {
    if (phase !== 'running' && phase !== 'review-grid') return;
    const t = setInterval(() => setRemaining((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const submit = useCallback(async () => {
    if (!payload || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const review = await apiClient.post(`/assessments/attempts/${payload.attemptId}/submit`, {});
      setResult(review);
      setPhase('result');
    } catch (e: any) {
      setError('Submit failed — your answers are saved; try again.');
      submittingRef.current = false;
    }
  }, [payload]);

  // hard submit on expiry
  useEffect(() => {
    if (remaining <= 0 && (phase === 'running' || phase === 'review-grid') && payload) {
      submit();
    }
  }, [remaining, phase, payload, submit]);

  // ---- autosave ----
  const persist = useCallback(
    (item: Item, answer: any, flagged?: boolean) => {
      if (!payload) return;
      const key = item.id;
      if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
      saveTimers.current[key] = setTimeout(async () => {
        try {
          setSaving(true);
          const timeSpentSec = Math.round((Date.now() - enteredAt.current) / 1000);
          enteredAt.current = Date.now();
          const resp = await apiClient.post<{ remainingSec: number }>(
            `/assessments/attempts/${payload.attemptId}/responses`,
            {
              kind: item.kind,
              itemId: item.id,
              answer,
              ...(flagged !== undefined ? { flagged } : {}),
              timeSpentSec: Math.min(timeSpentSec, 600),
            }
          );
          setRemaining(resp.remainingSec); // re-sync to the server clock
        } catch {
          /* keep local state; next save retries */
        } finally {
          setSaving(false);
        }
      }, 700);
    },
    [payload]
  );

  const chooseOption = (item: Item, optionId: string) => {
    const next = [optionId]; // SINGLE-choice bank
    setAnswers((a) => ({ ...a, [item.id]: next }));
    persist(item, next);
  };

  const toggleFlag = (item: Item) => {
    const next = !flags[item.id];
    setFlags((f) => ({ ...f, [item.id]: next }));
    persist(item, answers[item.id] ?? null, next);
  };

  const updateCode = (item: Item, language: string, code: string) => {
    const next = { language, code };
    setAnswers((a) => ({ ...a, [item.id]: next }));
    persist(item, next);
  };

  // ---- coding run/submit ----
  const runCode = async (item: Item, hidden: boolean) => {
    const ans = answers[item.id];
    if (!ans?.code) return;
    setRunning(true);
    setRunOutput(null);
    try {
      const resp = await apiClient.post<any>(hidden ? '/code/submit' : '/code/run', {
        problemId: item.id,
        language: ans.language,
        source: ans.code,
        ...(hidden && payload ? { attemptId: payload.attemptId } : {}),
      });
      setRunOutput({ hidden, ...resp });
    } catch (e: any) {
      setRunOutput({ error: e?.message || 'Run failed' });
    } finally {
      setRunning(false);
    }
  };

  // ---- derived ----
  const sections = useMemo(() => {
    if (!payload) return [];
    const out: { title: string; items: { item: Item; index: number }[] }[] = [];
    payload.items.forEach((item, index) => {
      let s = out.find((x) => x.title === item.sectionTitle);
      if (!s) {
        s = { title: item.sectionTitle, items: [] };
        out.push(s);
      }
      s.items.push({ item, index });
    });
    return out;
  }, [payload]);

  const answeredCount = payload
    ? payload.items.filter((i) => {
        const a = answers[i.id];
        return Array.isArray(a) ? a.length > 0 : a?.code;
      }).length
    : 0;

  const fmt = (s: number) => {
    const sign = s < 0 ? 0 : s;
    const h = Math.floor(sign / 3600);
    const m = Math.floor((sign % 3600) / 60);
    const sec = sign % 60;
    return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ================= screens =================

  if (error) {
    return (
      <div className="bg-red-50 p-8 rounded-xl text-center">
        <p className="text-red-700 font-bold mb-4">{error}</p>
        <button onClick={onExit} className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg">
          Back
        </button>
      </div>
    );
  }
  if (!payload) return <div className="text-gray-500 italic p-12 text-center">Preparing your test…</div>;

  // ---- consent / instructions ----
  if (phase === 'consent') {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-black mb-2">{payload.test.title}</h1>
        {payload.test.description && <p className="text-gray-600 mb-4">{payload.test.description}</p>}
        <ul className="text-sm text-gray-700 space-y-2 mb-6 list-disc pl-5">
          <li>Duration: <b>{payload.test.durationMinutes} minutes</b>. The server clock is authoritative — the test auto-submits when time runs out.</li>
          <li>{payload.items.length} questions across {sections.length} section{sections.length > 1 ? 's' : ''}.</li>
          {payload.test.negativeMarking > 0 && (
            <li>Negative marking: <b>−{payload.test.negativeMarking}</b> per wrong answer. Unanswered questions score 0.</li>
          )}
          <li>Your answers autosave. If your browser crashes, reopen the test to resume with the same questions and remaining time.</li>
          <li>Use 🚩 to mark questions for review; a review grid is shown before final submission.</li>
          {payload.test.mode === 'PROCTORED' && (
            <li className="text-red-700 font-semibold">
              This is a proctored test: tab switches, fullscreen exits, and copy/paste are recorded, and camera
              monitoring applies while the attempt is open.
            </li>
          )}
        </ul>
        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="mt-1 h-5 w-5" />
          <span className="text-sm text-gray-700">
            I have read the instructions{payload.test.mode === 'PROCTORED' ? ' and I consent to activity and camera monitoring during this attempt' : ''}.
          </span>
        </label>
        <div className="flex gap-3">
          <button onClick={onExit} className="flex-1 py-3 rounded-xl font-bold bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button
            disabled={!consented}
            onClick={async () => {
              if (payload.test.mode === 'PROCTORED') {
                // server withholds PROCTORED items until consent is recorded
                try {
                  const full = await apiClient.post<AttemptPayload>(
                    `/assessments/attempts/${payload.attemptId}/consent`, {}
                  );
                  setPayload(full);
                  setRemaining(full.remainingSec);
                } catch {
                  setError('Could not record consent — try again.');
                  return;
                }
                await enterFullscreen();
              }
              enteredAt.current = Date.now();
              setPhase('running');
            }}
            className="flex-1 py-3 rounded-xl font-black text-white bg-gradient-to-r from-indigo-500 to-purple-600 disabled:opacity-40"
          >
            Begin Test →
          </button>
        </div>
      </div>
    );
  }

  // ---- result / scorecard ----
  if (phase === 'result' && result) {
    const b = result.breakdown || {};
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white p-8 rounded-2xl shadow-xl text-center mb-6">
          <h1 className="text-2xl font-black mb-1">{payload.test.title}</h1>
          <p className="text-gray-500 mb-4">{result.status === 'EXPIRED' ? 'Time expired — auto-submitted' : 'Submitted'}</p>
          <div className="text-6xl font-black mb-2">{result.score ?? 0}%</div>
          {b.passed != null && (
            <div className={`font-black text-lg ${b.passed ? 'text-emerald-600' : 'text-red-600'}`}>
              {b.passed ? '✅ PASSED' : '❌ Below pass mark'}
            </div>
          )}
          <p className="text-sm text-gray-500 mt-2">
            {b.scoredMarks} / {b.totalMarks} marks
            {b.ungraded > 0 && <> · {b.ungraded} question{b.ungraded > 1 ? 's' : ''} ungraded (answer key pending)</>}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {(b.sections || []).map((s: any, i: number) => (
              <div key={i} className="bg-indigo-50 rounded-lg p-3">
                <div className="text-xs font-bold text-indigo-500">{s.title}</div>
                <div className="font-black">{s.scored} / {s.total}</div>
              </div>
            ))}
          </div>
        </div>

        {(result.weakTopics || []).length > 0 && (
          <div className="bg-white p-6 rounded-2xl shadow-xl mb-6">
            <h2 className="font-black text-lg mb-2">📉 Weakest topics</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {result.weakTopics.map((t: any) => (
                <span key={t.name} className="text-sm bg-red-50 text-red-700 font-bold px-3 py-1 rounded-full">
                  {t.name} · {t.accuracy}%
                </span>
              ))}
            </div>
            {onPractice && (
              <button
                onClick={async () => {
                  try {
                    const p = await apiClient.post<{ testId: string }>(
                      `/assessments/attempts/${result.attemptId}/practice-weak`, {}
                    );
                    onPractice(p.testId);
                  } catch {
                    setError('Could not build the practice test.');
                  }
                }}
                className="w-full py-3 rounded-xl font-black text-white bg-gradient-to-r from-rose-500 to-orange-500"
              >
                🎯 Practice your weak topics now
              </button>
            )}
          </div>
        )}

        <h2 className="font-black text-xl mb-3">Review</h2>
        {(result.items || []).filter((i: any) => i.kind === 'coding').map((i: any, n: number) => (
          <div key={`c${n}`} className="bg-white p-5 rounded-xl shadow mb-3">
            <div className="text-xs font-bold text-indigo-500 mb-1">Coding · {i.sectionTitle}</div>
            <div className="font-semibold">
              {i.answer?.passed != null
                ? `Hidden tests passed: ${i.answer.passed}/${i.answer.total} · ${Math.round(i.marks * 100) / 100} marks earned`
                : 'Not attempted'}
            </div>
          </div>
        ))}
        {(result.items || []).filter((i: any) => i.kind === 'question').map((i: any, n: number) => {
          const chosenIds: string[] = Array.isArray(i.chosen) ? i.chosen : [];
          return (
            <div key={n} className="bg-white p-5 rounded-xl shadow mb-3">
              <div className="text-xs font-bold text-indigo-500 mb-1">
                {i.topic} · {i.sectionTitle}{i.timeSpentSec > 0 ? ` · ${i.timeSpentSec}s` : ''}
              </div>
              <p className="font-semibold mb-3"><RichText text={i.stem} /></p>
              <div className="space-y-1">
                {(i.options || []).map((o: any) => (
                  <div
                    key={o.id}
                    className={`px-3 py-2 rounded text-sm ${
                      o.isCorrect ? 'bg-emerald-100 font-bold' : chosenIds.includes(o.id) ? 'bg-red-100' : 'bg-gray-50'
                    }`}
                  >
                    <RichText text={o.text} />
                    {o.isCorrect && ' ✓'}
                    {!o.isCorrect && chosenIds.includes(o.id) && ' ✗ (your answer)'}
                  </div>
                ))}
              </div>
              {i.isCorrect == null && chosenIds.length > 0 && (
                <p className="text-xs text-amber-600 mt-2">Ungraded — the answer key for this question is pending review.</p>
              )}
              {i.explanation && (
                <details className="text-sm text-gray-600 mt-2">
                  <summary className="cursor-pointer font-bold">Worked solution</summary>
                  <p className="mt-1"><RichText text={i.explanation} /></p>
                </details>
              )}
            </div>
          );
        })}
        <button onClick={onExit} className="w-full py-3 rounded-xl font-black text-white bg-indigo-600 my-6">
          Done
        </button>
      </div>
    );
  }

  // ---- review grid before submit ----
  if (phase === 'review-grid') {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl">
        <h2 className="text-xl font-black mb-1">Ready to submit?</h2>
        <p className="text-sm text-gray-500 mb-4">
          {answeredCount} of {payload.items.length} answered · ⏱ {fmt(remaining)} left
        </p>
        {sections.map((s) => (
          <div key={s.title} className="mb-4">
            <div className="text-xs font-bold text-gray-500 uppercase mb-2">{s.title}</div>
            <div className="flex flex-wrap gap-2">
              {s.items.map(({ item, index }) => {
                const a = answers[item.id];
                const answered = Array.isArray(a) ? a.length > 0 : !!a?.code;
                return (
                  <button
                    key={item.id}
                    onClick={() => { setCurrent(index); setPhase('running'); }}
                    className={`w-9 h-9 rounded-lg text-sm font-black ${
                      flags[item.id] ? 'bg-amber-400 text-white' : answered ? 'bg-emerald-500 text-white' : 'bg-gray-200'
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="flex gap-3 mt-6">
          <button onClick={() => setPhase('running')} className="flex-1 py-3 rounded-xl font-bold bg-gray-100 hover:bg-gray-200">
            ← Keep working
          </button>
          <button onClick={submit} className="flex-1 py-3 rounded-xl font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600">
            Submit Final Answers
          </button>
        </div>
      </div>
    );
  }

  // ---- running ----
  const item = payload.items[current];
  const isCoding = item.kind === 'coding';
  const codingAns = isCoding
    ? answers[item.id] || { language: 'python', code: item.content?.starterCode?.python || '' }
    : null;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {proctorWarning && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-white font-bold px-5 py-2 rounded-full shadow-lg text-sm">
          ⚠️ {proctorWarning} This is informational and was added to the attempt log.
        </div>
      )}
      <SelfViewCamera active={proctoringActive} proctoring={proctoringActive} faceStatus={faceStatus} />

      {/* navigator */}
      <div className="lg:w-56 shrink-0 bg-white rounded-xl shadow p-4 h-fit lg:sticky lg:top-4">
        <div className={`text-2xl font-black text-center mb-3 ${remaining < 300 ? 'text-red-600 animate-pulse' : ''}`}>
          ⏱ {fmt(remaining)}
        </div>
        <div className="text-xs text-center text-gray-400 mb-3">
          {saving ? 'saving…' : 'saved'}
          {proctored && <span className="ml-2">{cameraOn ? '🎥 monitoring' : '🚫 no camera'}</span>}
        </div>
        {sections.map((s) => (
          <div key={s.title} className="mb-3">
            <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">{s.title}</div>
            <div className="flex flex-wrap gap-1">
              {s.items.map(({ item: it, index }) => {
                const a = answers[it.id];
                const answered = Array.isArray(a) ? a.length > 0 : !!a?.code;
                return (
                  <button
                    key={it.id}
                    onClick={() => { setCurrent(index); setRunOutput(null); enteredAt.current = Date.now(); }}
                    className={`w-7 h-7 rounded text-xs font-black ${
                      index === current
                        ? 'ring-2 ring-indigo-600 bg-indigo-100'
                        : flags[it.id]
                          ? 'bg-amber-400 text-white'
                          : answered
                            ? 'bg-emerald-500 text-white'
                            : 'bg-gray-200'
                    }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button
          onClick={() => setPhase('review-grid')}
          className="w-full mt-2 py-2 rounded-lg font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600 text-sm"
        >
          Review & Submit
        </button>
      </div>

      {/* question area */}
      <div className="flex-1 bg-white rounded-xl shadow p-6">
        <div className="flex justify-between items-center mb-3">
          <div className="text-xs font-bold text-indigo-500 uppercase">
            {item.sectionTitle} · Q{current + 1}/{payload.items.length} · {item.marks} mark{item.marks !== 1 ? 's' : ''}
          </div>
          <button
            onClick={() => toggleFlag(item)}
            className={`text-sm font-bold px-3 py-1 rounded-full ${flags[item.id] ? 'bg-amber-400 text-white' : 'bg-gray-100'}`}
          >
            🚩 {flags[item.id] ? 'Flagged' : 'Flag'}
          </button>
        </div>

        {!isCoding && item.content && (
          <>
            {item.content.assets?.context && (
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded mb-3 max-h-56 overflow-y-auto">
                <RichText text={item.content.assets.context} />
              </div>
            )}
            <p className="font-semibold mb-4"><RichText text={item.content.stem} /></p>
            <div className="space-y-2">
              {item.content.options.map((o: any, i: number) => {
                const chosen = Array.isArray(answers[item.id]) && answers[item.id].includes(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => chooseOption(item, o.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 font-medium transition ${
                      chosen ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    <span className="font-black mr-2">{String.fromCharCode(65 + i)}.</span>
                    <RichText text={o.text} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {isCoding && item.content && (
          <>
            <h2 className="text-lg font-black mb-2">{item.content.title}</h2>
            <p className="text-sm whitespace-pre-wrap mb-3">{item.content.statement}</p>
            {item.content.constraints && (
              <p className="text-xs text-gray-500 mb-3">Constraints: {item.content.constraints}</p>
            )}
            {(item.content.sampleIo || []).slice(0, 2).map((io: any, i: number) => (
              <div key={i} className="text-xs bg-gray-50 rounded p-2 mb-2 font-mono whitespace-pre-wrap">
                <b>Sample input:</b>{'\n'}{io.input}{'\n'}<b>Expected output:</b>{'\n'}{io.output}
              </div>
            ))}
            <div className="flex items-center gap-3 my-3">
              <select
                value={codingAns.language}
                onChange={(e) => {
                  const lang = e.target.value;
                  updateCode(item, lang, item.content.starterCode?.[lang] || '');
                }}
                className="border rounded-lg px-3 py-2 font-bold text-sm"
              >
                {Object.keys(item.content.starterCode || { python: 1 }).map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <button
                disabled={running}
                onClick={() => runCode(item, false)}
                className="px-4 py-2 rounded-lg font-bold bg-gray-800 text-white text-sm disabled:opacity-50"
              >
                {running ? 'Running…' : '▶ Run samples'}
              </button>
              <button
                disabled={running}
                onClick={() => runCode(item, true)}
                className="px-4 py-2 rounded-lg font-bold bg-emerald-600 text-white text-sm disabled:opacity-50"
              >
                ✓ Submit code
              </button>
            </div>
            <div className="border rounded-lg overflow-hidden mb-3">
              <Editor
                height="320px"
                language={MONACO_LANG[codingAns.language] || 'python'}
                value={codingAns.code}
                onChange={(v) => updateCode(item, codingAns.language, v || '')}
                options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
              />
            </div>
            {runOutput && (
              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm font-mono">
                {runOutput.error && <div className="text-red-400">{runOutput.error}</div>}
                {!runOutput.error && (
                  <>
                    <div className="font-black mb-2">
                      {runOutput.hidden ? 'Hidden tests' : 'Sample tests'}: {runOutput.passed}/{runOutput.total} passed
                      {runOutput.hidden && runOutput.score != null && <> · score {runOutput.score}%</>}
                    </div>
                    {(runOutput.results || runOutput.breakdown || []).map((r: any, i: number) => (
                      <div key={i} className={r.passed || r.status === 'Accepted' ? 'text-emerald-400' : 'text-red-400'}>
                        case {r.case}: {r.status}
                        {r.stdout != null && !runOutput.hidden && r.status !== 'Accepted' && (
                          <span className="text-gray-400"> — got {JSON.stringify(r.stdout?.slice(0, 60))}, want {JSON.stringify(r.expected?.slice(0, 60))}</span>
                        )}
                      </div>
                    ))}
                    {runOutput.compileOutput && <pre className="text-amber-300 mt-2 whitespace-pre-wrap">{runOutput.compileOutput.slice(0, 500)}</pre>}
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex justify-between mt-6">
          <button
            disabled={current === 0}
            onClick={() => { setCurrent(current - 1); setRunOutput(null); enteredAt.current = Date.now(); }}
            className="px-5 py-2 rounded-lg font-bold bg-gray-100 disabled:opacity-40"
          >
            ← Prev
          </button>
          {current < payload.items.length - 1 ? (
            <button
              onClick={() => { setCurrent(current + 1); setRunOutput(null); enteredAt.current = Date.now(); }}
              className="px-5 py-2 rounded-lg font-bold bg-indigo-600 text-white"
            >
              Next →
            </button>
          ) : (
            <button onClick={() => setPhase('review-grid')} className="px-5 py-2 rounded-lg font-black bg-emerald-600 text-white">
              Review & Submit
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
