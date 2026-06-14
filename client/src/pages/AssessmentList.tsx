import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface AvailableTest {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  mode: 'PRACTICE' | 'PROCTORED';
  negativeMarking: number;
  passScore: number | null;
  company: { name: string } | null;
  sections: { title: string; kind: string }[];
  attempts: { id: string; status: string; score: number | null; startedAt: string }[];
}

interface CompanyCard {
  id: string;
  name: string;
  slug: string;
  rounds: { title: string; count: number }[];
  tracks: string[];
  durationMinutes: number;
}

export const AssessmentList: React.FC<{
  onStart: (testId: string) => void;
  onOpenCompany: (slug: string) => void;
  onBack: () => void;
}> = ({ onStart, onOpenCompany, onBack }) => {
  const [tests, setTests] = useState<AvailableTest[]>([]);
  const [companies, setCompanies] = useState<CompanyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<AvailableTest[]>('/assessments/available')
      .then(setTests)
      .catch(() => setError('Failed to load tests'))
      .finally(() => setLoading(false));
    apiClient.get<CompanyCard[]>('/companies').then(setCompanies).catch(() => {});
  }, []);

  return (
    <div>
      <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-bold mb-4">
        ← Back to Dashboard
      </button>
      <h1 className="text-3xl font-black mb-6">📝 Mock Tests</h1>

      {error && <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">{error}</div>}
      {loading && <div className="text-gray-500 italic p-8 text-center">Loading…</div>}

      {companies.length > 0 && (
        <div className="mb-8">
          <h2 className="font-black text-lg mb-3">🏢 Prepare for a company</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenCompany(c.slug)}
                className="text-left bg-gradient-to-br from-slate-800 to-slate-900 text-white p-5 rounded-xl shadow-lg hover:-translate-y-0.5 transition"
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-black text-lg">{c.name}</h3>
                  {c.tracks.length > 0 && (
                    <span className="text-[10px] bg-indigo-600 px-2 py-0.5 rounded-full font-bold">
                      {c.tracks.length} tracks
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mb-3">
                  {c.rounds.map((r) => `${r.title} (${r.count})`).join(' · ')} · {c.durationMinutes} min
                </p>
                <span className="inline-block w-full text-center py-2 rounded-lg font-black bg-white text-slate-900 text-sm">
                  📊 Open prep &amp; readiness →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!loading && tests.length === 0 && (
        <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
          No published tests yet. Check back soon!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tests.map((t) => {
          const inProgress = t.attempts.find((a) => a.status === 'IN_PROGRESS');
          const best = t.attempts
            .filter((a) => a.score != null)
            .reduce((m, a) => Math.max(m, a.score!), 0);
          return (
            <div key={t.id} className="bg-white p-6 rounded-xl shadow-lg flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-xl font-bold">
                  {t.title}
                  {t.company && (
                    <span className="ml-2 text-xs align-middle bg-slate-800 text-white px-2 py-1 rounded font-black">
                      {t.company.name}
                    </span>
                  )}
                </h2>
                <span
                  className={`text-xs font-black px-2 py-1 rounded ${
                    t.mode === 'PROCTORED'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {t.mode}
                </span>
              </div>
              {t.description && <p className="text-sm text-gray-600 mb-3">{t.description}</p>}
              <div className="flex flex-wrap gap-2 mb-3">
                {t.sections.map((s, i) => (
                  <span key={i} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-semibold">
                    {s.title}
                  </span>
                ))}
              </div>
              <div className="text-sm text-gray-500 mb-4">
                ⏱ {t.durationMinutes} min
                {t.negativeMarking > 0 && <> · −{t.negativeMarking} per wrong answer</>}
                {t.passScore != null && <> · pass ≥ {t.passScore}%</>}
                {t.attempts.length > 0 && best > 0 && <> · best {best}%</>}
              </div>
              <button
                onClick={() => onStart(t.id)}
                className={`mt-auto font-black py-3 px-6 rounded-xl text-white transition transform hover:-translate-y-0.5 ${
                  inProgress
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600'
                    : 'bg-gradient-to-r from-indigo-500 to-purple-600'
                }`}
              >
                {inProgress ? '▶ Resume Attempt' : '🚀 Start Test'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
