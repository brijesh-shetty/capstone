import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';

interface Option {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

interface ReviewQuestion {
  id: string;
  stem: string;
  proposedAnswer: string | null;
  explanation: string | null;
  assets: {
    page?: number;
    context?: string;
    requiresImage?: boolean;
    incompleteOptions?: boolean;
    solverDisagreement?: string[];
    audit?: { status: string; reason: string; model?: string; at?: string };
  } | null;
  topic: { name: string; slug: string; category: string };
  options: Option[];
}

interface QueueResponse {
  total: number;
  page: number;
  pageSize: number;
  counts: { unverified: number; verified: number };
  questions: ReviewQuestion[];
}

const FILTERS = [
  { key: 'unverified', label: 'All Unverified' },
  { key: 'disagreement', label: '🤖 Solver Disagreements' },
  { key: 'image', label: '🖼️ Needs Image' },
  { key: 'incomplete', label: '⚠️ Incomplete Options' },
  { key: 'needs-context', label: '🧩 Missing Context' },
];

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export const ReviewQueue: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [filter, setFilter] = useState('unverified');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiClient.get<QueueResponse>(
        `/admin/review-queue?filter=${filter}&page=${page}`
      );
      setData(resp);
    } catch (e) {
      setError('Failed to load review queue (admin/educator access required).');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmAnswer = async (questionId: string, optionId: string) => {
    setBusyId(questionId);
    try {
      await apiClient.post(`/admin/questions/${questionId}/verify`, { optionId });
      await load();
    } catch {
      setError('Failed to verify question.');
    } finally {
      setBusyId(null);
    }
  };

  const rejectQuestion = async (questionId: string) => {
    if (!window.confirm('Delete this question from the bank permanently?')) return;
    setBusyId(questionId);
    try {
      await apiClient.post(`/admin/questions/${questionId}/reject`, {});
      await load();
    } catch {
      setError('Failed to delete question.');
    } finally {
      setBusyId(null);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-bold mb-4">
        ← Back to Dashboard
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-black">🔍 Question Review Queue</h1>
        {data && (
          <div className="text-sm font-semibold text-gray-600">
            ✅ {data.counts.verified} verified · ⏳ {data.counts.unverified} pending
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`px-4 py-2 rounded-full font-bold text-sm transition ${
              filter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 hover:bg-indigo-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">{error}</div>}
      {loading && <div className="text-gray-500 italic p-8 text-center">Loading…</div>}

      {!loading && data && data.questions.length === 0 && (
        <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
          🎉 Nothing to review in this filter.
        </div>
      )}

      {!loading &&
        data?.questions.map((q) => (
          <div key={q.id} className="bg-white p-6 rounded-xl shadow-lg mb-4">
            <div className="flex justify-between items-start mb-2">
              <div className="text-xs font-bold text-indigo-500 uppercase">
                {q.topic.category} · {q.topic.name}
                {q.assets?.page ? ` · handout p.${q.assets.page}` : ''}
              </div>
              <div className="flex gap-2">
                {q.assets?.requiresImage && (
                  <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-bold">
                    needs figure
                  </span>
                )}
                {q.assets?.solverDisagreement && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-bold">
                    AI split: {q.assets.solverDisagreement.join(' vs ')}
                  </span>
                )}
                {q.assets?.audit && q.assets.audit.status !== 'SELF_CONTAINED' && (
                  <span
                    className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold"
                    title={q.assets.audit.reason}
                  >
                    {q.assets.audit.status === 'NEEDS_CONTEXT' ? 'missing context' : q.assets.audit.status.toLowerCase()}
                  </span>
                )}
                {q.proposedAnswer && !q.assets?.solverDisagreement && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">
                    AI proposed: {q.proposedAnswer}
                  </span>
                )}
              </div>
            </div>

            {q.assets?.context && (
              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded mb-2 whitespace-pre-wrap">
                {q.assets.context.slice(0, 600)}
              </div>
            )}
            <p className="font-semibold whitespace-pre-wrap mb-4">{q.stem}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
              {q.options.map((o) => (
                <button
                  key={o.id}
                  disabled={busyId === q.id}
                  onClick={() => confirmAnswer(q.id, o.id)}
                  title="Click to confirm as the correct answer"
                  className={`text-left px-4 py-2 rounded-lg border-2 transition font-medium ${
                    q.proposedAnswer === LETTERS[o.order]
                      ? 'border-blue-400 bg-blue-50 hover:bg-green-100 hover:border-green-500'
                      : 'border-gray-200 hover:bg-green-100 hover:border-green-500'
                  }`}
                >
                  <span className="font-black mr-2">{LETTERS[o.order]}.</span>
                  {o.text}
                </button>
              ))}
            </div>

            {q.explanation && (
              <details className="text-sm text-gray-600 mb-2">
                <summary className="cursor-pointer font-bold">AI worked solution</summary>
                <p className="whitespace-pre-wrap mt-2">{q.explanation}</p>
              </details>
            )}

            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>Click an option to confirm it as correct.</span>
              <button
                onClick={() => rejectQuestion(q.id)}
                disabled={busyId === q.id}
                className="text-red-500 hover:text-red-700 font-bold"
              >
                🗑️ Delete question
              </button>
            </div>
          </div>
        ))}

      {!loading && data && totalPages > 1 && (
        <div className="flex justify-center gap-4 items-center my-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-4 py-2 bg-white rounded-lg shadow font-bold disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="font-bold text-gray-600">
            Page {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 bg-white rounded-lg shadow font-bold disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};
