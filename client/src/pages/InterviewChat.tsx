import React, { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api';

// AI mock interview: pick a role → chat with the AI interviewer → rubric report.

interface Turn {
  order: number;
  role: 'INTERVIEWER' | 'CANDIDATE';
  content: string;
  turnScore: number | null;
  feedback: string | null;
}

interface Interview {
  id: string;
  role: string;
  company: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  overallScore: number | null;
  rubricScores: Record<string, number> | null;
  summary: { strengths: string[]; gaps: string[]; nextSteps: string[] } | null;
  proctoringSummary?: Record<string, number> | null;
  maxQuestions: number;
  turns: Turn[];
}

const ROLES = ['SDE (Generalist)', 'Backend Engineer', 'Frontend Engineer', 'Data Analyst', 'DevOps Engineer'];

const RUBRIC_LABELS: Record<string, string> = {
  technical: 'Technical correctness',
  communication: 'Communication',
  structure: 'Structure (STAR)',
  problemSolving: 'Problem solving',
  roleFit: 'Role fit',
};

export const InterviewChat: React.FC<{
  onBack: () => void;
  onStartVideo?: (role: string, companyId: string | null) => void;
  initialInterviewId?: string | null;
}> = ({ onBack, onStartVideo, initialInterviewId }) => {
  const [past, setPast] = useState<any[]>([]);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [role, setRole] = useState(ROLES[0]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.get<any[]>('/ai-interview').then(setPast).catch(() => {});
    apiClient.get<any[]>('/companies').then((cs) => setCompanies(cs.filter((c) => c.hasInterviewStyle))).catch(() => {});
    if (initialInterviewId) {
      // arriving from the video interview room — open its report directly
      apiClient.get<Interview>(`/ai-interview/${initialInterviewId}`).then(setInterview).catch(() => {});
    }
  }, [initialInterviewId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interview?.turns.length, busy]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setInterview(await apiClient.post<Interview>('/ai-interview/start', {
        role,
        ...(companyId ? { companyId } : {}),
      }));
    } catch {
      setError('Could not start the interview — is the AI provider configured?');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!interview || !draft.trim() || busy) return;
    const content = draft.trim();
    setDraft('');
    // optimistic append
    setInterview({
      ...interview,
      turns: [...interview.turns, { order: interview.turns.length, role: 'CANDIDATE', content, turnScore: null, feedback: null }],
    });
    setBusy(true);
    try {
      setInterview(await apiClient.post<Interview>(`/ai-interview/${interview.id}/reply`, { content }));
    } catch {
      setError('Failed to send — try again.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!interview || busy) return;
    setBusy(true);
    try {
      setInterview(await apiClient.post<Interview>(`/ai-interview/${interview.id}/finish`, {}));
    } catch {
      setError('Failed to score the interview.');
    } finally {
      setBusy(false);
    }
  };

  // ---- report ----
  if (interview && interview.status !== 'IN_PROGRESS') {
    const rubric = interview.rubricScores || {};
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={() => { setInterview(null); apiClient.get<any[]>('/ai-interview').then(setPast).catch(() => {}); }}
          className="text-indigo-600 font-bold mb-4">← New interview</button>
        <div className="bg-white p-8 rounded-2xl shadow-xl text-center mb-6">
          <h1 className="text-2xl font-black mb-1">🤖 Interview Report — {interview.role}</h1>
          <p className="text-gray-500 mb-4">{interview.status === 'ABANDONED' ? 'Ended without answers' : 'Completed'}</p>
          {interview.overallScore != null && (
            <div className="text-6xl font-black mb-4">{interview.overallScore}<span className="text-2xl text-gray-400">/100</span></div>
          )}
          <div className="space-y-2 text-left max-w-md mx-auto">
            {Object.entries(RUBRIC_LABELS).map(([key, label]) => (
              <div key={key}>
                <div className="flex justify-between text-sm font-bold">
                  <span>{label}</span><span>{(rubric as any)[key] ?? '—'}/5</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full">
                  <div className="h-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full"
                    style={{ width: `${(((rubric as any)[key] || 0) / 5) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {interview.proctoringSummary &&
          Object.entries(interview.proctoringSummary).some(([k, v]) => k !== 'faceChecks' && v > 0) && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6 text-sm">
            <b>📷 Camera signal (informational, not a verdict):</b>{' '}
            {Object.entries(interview.proctoringSummary)
              .filter(([k, v]) => k !== 'faceChecks' && v > 0)
              .map(([k, v]) => `${k.split('_').join(' ').toLowerCase()} ×${v}`)
              .join(' · ')}
          </div>
        )}

        {interview.summary && (
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {([['💪 Strengths', interview.summary.strengths], ['🕳 Gaps', interview.summary.gaps], ['🧭 Next steps', interview.summary.nextSteps]] as const).map(([title, items]) => (
              <div key={title} className="bg-white p-5 rounded-xl shadow">
                <h2 className="font-black mb-2">{title}</h2>
                <ul className="text-sm space-y-1 list-disc pl-4">
                  {(items || []).map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}

        <h2 className="font-black text-xl mb-3">Transcript & per-answer feedback</h2>
        {interview.turns.map((t) => (
          <div key={t.order} className={`mb-3 ${t.role === 'CANDIDATE' ? 'pl-8' : 'pr-8'}`}>
            <div className={`p-4 rounded-xl text-sm whitespace-pre-wrap ${t.role === 'CANDIDATE' ? 'bg-indigo-50' : 'bg-white shadow'}`}>
              <div className="text-[10px] font-black text-gray-400 mb-1">{t.role === 'CANDIDATE' ? 'YOU' : 'INTERVIEWER'}</div>
              {t.content}
              {t.feedback && (
                <div className="mt-2 pt-2 border-t text-xs text-amber-700">
                  <b>Feedback{t.turnScore != null ? ` (${t.turnScore}/5)` : ''}:</b> {t.feedback}
                </div>
              )}
            </div>
          </div>
        ))}
        <button onClick={onBack} className="w-full py-3 rounded-xl font-black text-white bg-indigo-600 my-6">Done</button>
      </div>
    );
  }

  // ---- live chat ----
  if (interview) {
    const questionsAsked = interview.turns.filter((t) => t.role === 'INTERVIEWER').length;
    return (
      <div className="max-w-2xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
        <div className="flex justify-between items-center mb-3">
          <div className="font-black">🤖 {interview.role} — question {Math.min(questionsAsked, interview.maxQuestions)}/{interview.maxQuestions}</div>
          <button onClick={finish} disabled={busy} className="text-sm font-bold text-red-600 disabled:opacity-40">
            End & score now
          </button>
        </div>
        {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-2 text-sm">{error}</div>}
        <div className="flex-1 overflow-y-auto space-y-3 pb-3">
          {interview.turns.map((t) => (
            <div key={t.order} className={`flex ${t.role === 'CANDIDATE' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap ${
                t.role === 'CANDIDATE' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white shadow rounded-bl-sm'
              }`}>
                {t.content}
              </div>
            </div>
          ))}
          {busy && <div className="text-gray-400 text-sm italic">interviewer is typing…</div>}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2 pt-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
            rows={2}
            className="flex-1 border rounded-xl px-4 py-3 text-sm resize-none"
          />
          <button onClick={send} disabled={busy || !draft.trim()}
            className="px-5 rounded-xl font-black text-white bg-indigo-600 disabled:opacity-40">
            ➤
          </button>
        </div>
      </div>
    );
  }

  // ---- role picker ----
  return (
    <div className="max-w-xl mx-auto">
      <button onClick={onBack} className="text-indigo-600 font-bold mb-4">← Back to Dashboard</button>
      <div className="bg-white p-8 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-black mb-2">🤖 AI Mock Interview</h1>
        <p className="text-sm text-gray-600 mb-4">
          A {`~`}6-question mock interview: behavioral + role-specific technical + a light
          system-design discussion. You get a rubric-scored report with per-answer feedback.
        </p>
        <label className="text-xs font-bold text-gray-500">Target role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 font-bold mb-4">
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
        <label className="text-xs font-bold text-gray-500">Company style (optional)</label>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
          className="w-full border rounded-xl px-4 py-3 font-bold mb-4">
          <option value="">Generic interviewer</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-3 text-sm">{error}</div>}
        {onStartVideo && (
          <button onClick={() => onStartVideo(role, companyId || null)}
            className="w-full py-3 rounded-xl font-black text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 mb-3">
            📹 Start Face-to-Face Interview (voice + avatar)
          </button>
        )}
        <button onClick={start} disabled={busy}
          className="w-full py-3 rounded-xl font-black text-white bg-gradient-to-r from-indigo-500 to-purple-600 disabled:opacity-40">
          {busy ? 'Setting up…' : '💬 Start Text Interview'}
        </button>
      </div>

      {past.length > 0 && (
        <div className="mt-6">
          <h2 className="font-black mb-2">Past interviews</h2>
          {past.map((p) => (
            <button key={p.id}
              onClick={() => apiClient.get<Interview>(`/ai-interview/${p.id}`).then(setInterview)}
              className="w-full text-left bg-white p-4 rounded-xl shadow mb-2 hover:bg-indigo-50">
              <span className="font-bold text-sm">{p.role}</span>
              <span className="text-xs text-gray-500 ml-2">
                {new Date(p.startedAt).toLocaleString()} · {p.status}
                {p.overallScore != null ? ` · ${p.overallScore}/100` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
