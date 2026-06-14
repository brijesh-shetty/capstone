import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

// Per-company prep hub: pattern overview + an explainable Placement Readiness
// Index + the three ways to raise it (proctored pattern mock, targeted round
// drill, company-styled AI interview). Built on the existing /companies,
// /assessments and /ai-interview endpoints.

interface ReadinessComponent {
  key: string;
  label: string;
  value: number;
  weight: number;
  present: boolean;
}
interface NextAction {
  label: string;
  action: 'mock' | 'round-practice' | 'interview';
  target?: string[];
}
interface Readiness {
  score: number;
  confidence: number;
  components: ReadinessComponent[];
  nextActions: NextAction[];
  weakTopics: string[];
}
interface PrepPayload {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  notes: string | null;
  durationMinutes: number | null;
  negativeMarking: number;
  passScore: number | null;
  rounds: { title: string; kind: string; category?: string; count: number; difficultyMix: any }[];
  tracks: { role: string }[];
  attempts: { id: string; status: string; score: number | null; startedAt: string }[];
  interviews: { id: string; status: string; overallScore: number | null; role: string; startedAt: string }[];
  readiness: Readiness;
}

const ringColor = (score: number) =>
  score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : score >= 25 ? '#f97316' : '#ef4444';

export const CompanyPrep: React.FC<{
  slug: string;
  onBack: () => void;
  onStartTest: (testId: string) => void;
  onStartInterview: (role: string, companyId: string) => void;
}> = ({ slug, onBack, onStartTest, onStartInterview }) => {
  const [prep, setPrep] = useState<PrepPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [track, setTrack] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiClient
      .get<PrepPayload>(`/companies/${slug}/prep`)
      .then((p) => {
        setPrep(p);
        if (!track && p.tracks.length > 0) setTrack(p.tracks[0].role);
      })
      .catch(() => setError('Failed to load company prep'))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [slug]);

  const role = track || 'Software Engineer';

  const takeMock = async () => {
    if (!prep) return;
    setBusy('mock');
    try {
      const { testId } = await apiClient.post<{ testId: string }>(
        `/companies/${prep.id}/practice-test`,
        track ? { track } : {}
      );
      onStartTest(testId);
    } catch {
      setError('Could not build the pattern mock.');
    } finally {
      setBusy(null);
    }
  };

  const drill = async (action: NextAction) => {
    if (!prep) return;
    setBusy('drill');
    try {
      const body = action.target?.length
        ? { topicNames: action.target }
        : { category: prep.rounds[0]?.category || 'QUANTITATIVE' };
      const { testId } = await apiClient.post<{ testId: string }>(
        `/companies/${prep.id}/round-practice`,
        body
      );
      onStartTest(testId);
    } catch {
      setError('Could not build the practice drill.');
    } finally {
      setBusy(null);
    }
  };

  const runAction = (a: NextAction) => {
    if (!prep) return;
    if (a.action === 'mock') takeMock();
    else if (a.action === 'interview') onStartInterview(role, prep.id);
    else drill(a);
  };

  if (loading) return <div className="text-gray-500 italic p-8 text-center">Loading…</div>;
  if (error && !prep) return <div className="bg-red-100 text-red-700 p-4 rounded-lg">{error}</div>;
  if (!prep) return null;

  const r = prep.readiness;
  const C = 2 * Math.PI * 52; // ring circumference

  return (
    <div>
      <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-bold mb-4">
        ← Back to Mock Tests
      </button>

      {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4">{error}</div>}

      {/* header + readiness */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-2xl p-6 mb-6 flex flex-col md:flex-row gap-6 items-center">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            {prep.logoUrl && <img src={prep.logoUrl} alt="" className="w-10 h-10 rounded bg-white p-1" />}
            <h1 className="text-3xl font-black">{prep.name}</h1>
          </div>
          <p className="text-sm text-slate-300">
            {prep.rounds.map((r) => `${r.title} (${r.count})`).join(' · ')}
            {prep.durationMinutes ? ` · ${prep.durationMinutes} min` : ''}
            {prep.negativeMarking > 0 ? ` · −${prep.negativeMarking}/wrong` : ''}
            {prep.passScore != null ? ` · pass ≥ ${prep.passScore}%` : ''}
          </p>
          {prep.tracks.length > 0 && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400">Role track:</span>
              {prep.tracks.map((t) => (
                <button
                  key={t.role}
                  onClick={() => setTrack(t.role)}
                  className={`text-xs font-bold px-3 py-1 rounded-full ${
                    track === t.role ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {t.role}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* readiness ring */}
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 120 120" className="w-32 h-32">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#334155" strokeWidth="12" />
            <circle
              cx="60" cy="60" r="52" fill="none" stroke={ringColor(r.score)} strokeWidth="12"
              strokeLinecap="round" strokeDasharray={C}
              strokeDashoffset={C - (C * r.score) / 100}
              transform="rotate(-90 60 60)"
            />
            <text x="60" y="56" textAnchor="middle" className="fill-white" fontSize="28" fontWeight="900">
              {r.score}
            </text>
            <text x="60" y="76" textAnchor="middle" className="fill-slate-400" fontSize="10">
              READINESS
            </text>
          </svg>
          <span className="text-[11px] text-slate-400 mt-1">Confidence {r.confidence}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* components + next actions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow p-5">
            <h2 className="font-black text-lg mb-3">Readiness breakdown</h2>
            {r.components.map((c) => (
              <div key={c.key} className="mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-gray-700">
                    {c.label} <span className="text-gray-400 text-xs">· {Math.round(c.weight * 100)}%</span>
                  </span>
                  <span className={c.present ? 'font-bold' : 'text-gray-400 italic'}>
                    {c.present ? `${c.value}%` : 'not attempted'}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${c.present ? c.value : 0}%`,
                      background: c.present ? ringColor(c.value) : '#cbd5e1',
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400 mt-2">
              Missing signals lower confidence, never your score — complete them to firm up your readiness.
            </p>
          </div>

          <div className="bg-white rounded-xl shadow p-5">
            <h2 className="font-black text-lg mb-3">🎯 What to do next</h2>
            <div className="space-y-2">
              {r.nextActions.map((a, i) => (
                <button
                  key={i}
                  onClick={() => runAction(a)}
                  disabled={!!busy}
                  className="w-full text-left flex items-center justify-between bg-indigo-50 hover:bg-indigo-100 rounded-lg px-4 py-3 font-semibold text-indigo-800 disabled:opacity-50"
                >
                  <span>{a.label}</span>
                  <span className="text-indigo-400">→</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CTAs + history */}
        <div className="space-y-4">
          <button
            onClick={takeMock}
            disabled={!!busy}
            className="w-full py-3 rounded-xl font-black text-white bg-gradient-to-r from-indigo-500 to-purple-600 disabled:opacity-50"
          >
            {busy === 'mock' ? 'Building…' : '▶ Take proctored pattern mock'}
          </button>
          <button
            onClick={() => onStartInterview(role, prep.id)}
            className="w-full py-3 rounded-xl font-black text-white bg-gradient-to-r from-emerald-500 to-teal-600"
          >
            🤖 {prep.name}-style AI interview{track ? ` · ${track}` : ''}
          </button>

          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-black text-sm mb-2">History</h3>
            {prep.attempts.length === 0 && prep.interviews.length === 0 && (
              <p className="text-xs text-gray-400 italic">No attempts yet.</p>
            )}
            {prep.attempts.map((a) => (
              <div key={a.id} className="flex justify-between text-xs py-1 border-b border-gray-50">
                <span className="text-gray-600">Mock · {new Date(a.startedAt).toLocaleDateString()}</span>
                <span className="font-bold">{a.score != null ? `${a.score}%` : a.status}</span>
              </div>
            ))}
            {prep.interviews.map((iv) => (
              <div key={iv.id} className="flex justify-between text-xs py-1 border-b border-gray-50">
                <span className="text-gray-600">Interview ({iv.role})</span>
                <span className="font-bold">{iv.overallScore != null ? `${iv.overallScore}%` : iv.status}</span>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-gray-400">
            Built from a pattern profile (round structure + difficulty) using our own verified question
            bank. No copyrighted company question text is stored.
          </p>
        </div>
      </div>
    </div>
  );
};
