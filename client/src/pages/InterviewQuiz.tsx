import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { useQuizIntegrity } from '../hooks/useQuizIntegrity';

type IntegritySignal = 'CLEAN' | 'LOW' | 'MEDIUM' | 'HIGH';

interface IntegrityResult {
  counts: { TAB_BLUR: number; COPY: number; PASTE: number; CONTEXT_MENU: number };
  hiddenMs: number;
  signal: IntegritySignal;
  score: number;
}

const SIGNAL_STYLES: Record<IntegritySignal, { label: string; cls: string }> = {
  CLEAN: { label: 'Clean session', cls: 'bg-green-50 border-green-200 text-green-800' },
  LOW: { label: 'Low activity', cls: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
  MEDIUM: { label: 'Some activity', cls: 'bg-orange-50 border-orange-200 text-orange-800' },
  HIGH: { label: 'High activity', cls: 'bg-red-50 border-red-200 text-red-800' },
};

interface Question {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string | null;
  difficulty: string;
}

interface QuizResult {
  questionId: string;
  isCorrect: boolean;
  correctIndex: number;
  correctAnswer: string;
  hintUsed?: boolean;
}

interface QuizSubmissionResponse {
  score: number;
  maxScore: number;
  percentage: number;
  xpEarned: number;
  results: QuizResult[];
  integrity: IntegrityResult | null;
}

interface Props {
  topicId: string;
  topicName: string;
  onComplete: () => void;
  onReviewTheory: () => void;
}

export const InterviewQuiz: React.FC<Props> = ({ topicId, topicName, onComplete, onReviewTheory }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [hintsUsed, setHintsUsed] = useState<Record<string, boolean>>({});
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const [loadingHint, setLoadingHint] = useState(false);
  
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loadingExplanation, setLoadingExplanation] = useState<Record<string, boolean>>({});

  const [submission, setSubmission] = useState<QuizSubmissionResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lightweight, transparent integrity monitor — active only while taking the quiz.
  const integrityActive = !loading && !submission && !error && questions.length > 0;
  const { warning: integrityWarning, getPayload: getIntegrityPayload, totalEvents } =
    useQuizIntegrity(integrityActive);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        // Fetch 10 random questions
        const data = await apiClient.get<Question[]>(`/interview/topics/${topicId}/questions?count=10`);
        setQuestions(data);
      } catch (e) {
        setError('Failed to load questions.');
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [topicId]);

  const handleSelectOption = (questionId: string, optionIndex: number) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleNext = () => {
    setActiveHint(null);
    setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1));
  };

  const handlePrev = () => {
    setActiveHint(null);
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleShowHint = async (questionId: string) => {
    if (activeHint) return; // already showing
    setLoadingHint(true);
    try {
      const res = await apiClient.get<{hint: string}>(`/interview/questions/${questionId}/hint`);
      setActiveHint(res.hint);
      setHintsUsed(prev => ({ ...prev, [questionId]: true }));
    } catch (e) {
      alert('Failed to load hint');
    } finally {
      setLoadingHint(false);
    }
  };

  const handleShowExplanation = async (questionId: string) => {
    if (explanations[questionId]) return; // already loaded
    setLoadingExplanation(prev => ({ ...prev, [questionId]: true }));
    try {
      const res = await apiClient.get<{explanation: string}>(`/interview/questions/${questionId}/explanation`);
      setExplanations(prev => ({ ...prev, [questionId]: res.explanation }));
    } catch (e) {
      alert('Failed to load explanation');
    } finally {
      setLoadingExplanation(prev => ({ ...prev, [questionId]: false }));
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const answersArray = Object.entries(selectedAnswers).map(([questionId, chosenIndex]) => ({
        questionId,
        chosenIndex,
        hintUsed: !!hintsUsed[questionId]
      }));

      const result = await apiClient.post<QuizSubmissionResponse>('/interview/submit', {
        topicId,
        answers: answersArray,
        integrity: getIntegrityPayload()
      });

      setSubmission(result);
    } catch (e) {
      setError('Failed to submit quiz.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || questions.length === 0) {
    return (
      <div className="text-center p-12">
        <p className="text-red-500 mb-4">{error || 'No questions found for this topic.'}</p>
        <button onClick={onComplete} className="text-indigo-600 font-bold hover:underline">Return to Hub</button>
      </div>
    );
  }

  // Scorecard View
  if (submission) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 text-center">
          <h2 className="text-3xl font-bold mb-2">Quiz Completed!</h2>
          <p className="text-gray-600 mb-6">Topic: {topicName}</p>
          
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-8">
            <div className="bg-indigo-50 rounded-lg p-4">
              <p className="text-sm text-indigo-600 font-bold mb-1">Score</p>
              <p className="text-3xl font-black text-indigo-900">{Math.round(submission.percentage)}%</p>
              <p className="text-xs text-indigo-500 mt-1">{submission.score} / {submission.maxScore}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-600 font-bold mb-1">XP Earned</p>
              <p className="text-3xl font-black text-green-900">+{submission.xpEarned}</p>
            </div>
          </div>

          {submission.integrity && (
            <div className={`max-w-md mx-auto mb-8 rounded-lg border p-4 text-left ${SIGNAL_STYLES[submission.integrity.signal].cls}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold">🛡️ Focus & integrity</p>
                <span className="text-xs font-bold uppercase tracking-wide">
                  {SIGNAL_STYLES[submission.integrity.signal].label}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span>Tab switches: <b>{submission.integrity.counts.TAB_BLUR}</b></span>
                <span>Pastes: <b>{submission.integrity.counts.PASTE}</b></span>
                <span>Copies: <b>{submission.integrity.counts.COPY}</b></span>
                <span>Right-clicks: <b>{submission.integrity.counts.CONTEXT_MENU}</b></span>
                {submission.integrity.hiddenMs > 1000 && (
                  <span className="col-span-2">
                    Time off-tab: <b>{Math.round(submission.integrity.hiddenMs / 1000)}s</b>
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] opacity-70">
                This is an advisory signal, not a verdict — it never changes your score or XP.
              </p>
            </div>
          )}

          <div className="flex justify-center gap-4">
            <button onClick={onReviewTheory} className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300">
              📖 Review Theory
            </button>
            <button onClick={onComplete} className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">
              🎯 Return to Hub
            </button>
          </div>
        </div>

        <h3 className="text-2xl font-bold mb-4">Detailed Review</h3>
        <div className="space-y-6">
          {questions.map((q, i) => {
            const res = submission.results.find(r => r.questionId === q.id);
            const userAns = selectedAnswers[q.id];
            const isCorrect = res?.isCorrect;
            
            return (
              <div key={q.id} className={`p-6 rounded-lg border-2 ${isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-start mb-4">
                  <span className={`text-2xl mr-3 ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                    {isCorrect ? '✅' : '❌'}
                  </span>
                  <div className="flex-1">
                    <p className="text-lg font-semibold text-gray-800">{i + 1}. {q.question}</p>
                    {res?.hintUsed && (
                      <span className="inline-block mt-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded">
                        💡 Hint Used (-20% XP)
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-10">
                  {[q.optionA, q.optionB, q.optionC, q.optionD, q.optionE].filter(Boolean).map((opt, optIdx) => {
                    let optClass = "p-3 rounded border bg-white ";
                    if (res?.correctIndex === optIdx) {
                      optClass += "border-green-500 bg-green-100 font-bold";
                    } else if (userAns === optIdx && !isCorrect) {
                      optClass += "border-red-500 bg-red-100 line-through text-red-700";
                    } else {
                      optClass += "border-gray-200 text-gray-600";
                    }
                    
                    return (
                      <div key={optIdx} className={optClass}>
                        {String.fromCharCode(65 + optIdx)}. {opt}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200">
                  {explanations[q.id] ? (
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                      <h4 className="font-bold text-blue-800 mb-2">Step-by-step Solution:</h4>
                      <p className="text-blue-900 whitespace-pre-wrap text-sm">{explanations[q.id]}</p>
                    </div>
                  ) : (
                    <button 
                      onClick={() => handleShowExplanation(q.id)}
                      disabled={loadingExplanation[q.id]}
                      className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center"
                    >
                      {loadingExplanation[q.id] ? 'Loading...' : '📝 Show Solution'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Active Quiz View
  const currentQ = questions[currentIndex];
  const options = [currentQ.optionA, currentQ.optionB, currentQ.optionC, currentQ.optionD];
  if (currentQ.optionE) options.push(currentQ.optionE);

  const isLastQuestion = currentIndex === questions.length - 1;
  const hasAnsweredCurrent = selectedAnswers[currentQ.id] !== undefined;

  return (
    <div className="max-w-3xl mx-auto">
      {integrityWarning && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="text-base">⚠️</span>
          <span>{integrityWarning}</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{topicName}</h2>
        <div className="flex items-center gap-3">
          <span
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400"
            title="This practice quiz notes tab switches, copying and pasting. It's advisory only and never changes your score."
          >
            <span className={`h-2 w-2 rounded-full ${totalEvents > 0 ? 'bg-amber-400' : 'bg-green-400'}`}></span>
            Focus monitor{totalEvents > 0 ? ` · ${totalEvents}` : ''}
          </span>
          <span className="text-gray-500 font-semibold">Question {currentIndex + 1} of {questions.length}</span>
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-2.5 mb-8">
        <div className="bg-indigo-600 h-2.5 rounded-full transition-all" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}></div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 mb-8">
        <p className="text-xl text-gray-800 font-medium mb-8 leading-relaxed">
          {currentQ.question}
        </p>

        <div className="space-y-3">
          {options.map((opt, idx) => {
            const isSelected = selectedAnswers[currentQ.id] === idx;
            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(currentQ.id, idx)}
                className={`w-full text-left p-4 rounded-lg border-2 transition ${
                  isSelected 
                  ? 'border-indigo-600 bg-indigo-50 shadow-sm' 
                  : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <span className="inline-block w-8 font-bold text-gray-400">{String.fromCharCode(65 + idx)}.</span>
                <span className={isSelected ? 'text-indigo-900 font-semibold' : 'text-gray-700'}>{opt}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          {activeHint ? (
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-yellow-800 flex items-start">
              <span className="text-xl mr-3">💡</span>
              <p className="text-sm font-medium pt-1">{activeHint}</p>
            </div>
          ) : (
            <button 
              onClick={() => handleShowHint(currentQ.id)}
              disabled={loadingHint}
              className="text-sm font-bold text-yellow-600 hover:text-yellow-700 flex items-center"
            >
              {loadingHint ? 'Loading hint...' : '💡 Show Hint (Reduces XP by 20%)'}
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="px-6 py-3 bg-gray-200 text-gray-700 font-bold rounded-lg disabled:opacity-50 hover:bg-gray-300 transition"
        >
          Previous
        </button>

        {isLastQuestion ? (
          <button
            onClick={handleSubmit}
            disabled={!hasAnsweredCurrent || submitting}
            className="px-8 py-3 bg-green-500 text-white font-bold rounded-lg shadow-lg hover:bg-green-600 disabled:opacity-50 transition"
          >
            {submitting ? 'Submitting...' : 'Submit Quiz'}
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={!hasAnsweredCurrent}
            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            Next Question
          </button>
        )}
      </div>
    </div>
  );
};
