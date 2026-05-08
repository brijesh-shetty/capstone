import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { SubtopicBreakdown } from '../components/SubtopicBreakdown';
import { WeakTopicCard } from '../components/WeakTopicCard';

interface TestAnalysisProps {
  testId: string;
  onBack: () => void;
}

export const TestAnalysis: React.FC<TestAnalysisProps> = ({ testId, onBack }) => {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<any>(`/tests/${testId}/analysis`)
      .then(data => {
        setAnalysis(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load analysis', err);
        setLoading(false);
      });
  }, [testId]);

  if (loading) {
    return <div className="text-center py-12">Analyzing your performance...</div>;
  }

  if (!analysis) {
    return <div className="text-center py-12">Failed to load analysis.</div>;
  }

  const { testInfo, breakdown, weakTopics, strongTopics } = analysis;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Overview Card */}
      <div className="bg-white p-8 rounded-lg shadow-lg flex flex-col md:flex-row items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-2">Test Analysis 📊</h2>
          <p className="text-gray-600 capitalize">{testInfo.testType} Exam • {new Date(testInfo.takenAt).toLocaleDateString()}</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-6">
          <div className="text-center">
            <p className="text-sm text-gray-500 uppercase font-bold tracking-wider">Score</p>
            <p className="text-3xl font-bold text-indigo-700">{testInfo.scoredMarks} <span className="text-xl text-gray-400">/ {testInfo.totalMarks}</span></p>
          </div>
          <div className="text-center border-l pl-6">
            <p className="text-sm text-gray-500 uppercase font-bold tracking-wider">Percentage</p>
            <p className={`text-3xl font-bold ${testInfo.percentage >= 80 ? 'text-green-500' : testInfo.percentage < 60 ? 'text-red-500' : 'text-orange-500'}`}>
              {testInfo.percentage}%
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Weaknesses & Strengths */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">⚠️ Areas for Improvement</h3>
            {weakTopics.length > 0 ? (
              <div className="space-y-3">
                {weakTopics.map((wt: any, idx: number) => (
                  <WeakTopicCard key={idx} subtopic={wt.subtopic} accuracy={wt.accuracy} />
                ))}
              </div>
            ) : (
              <p className="text-green-600 font-medium">Great job! No major weak areas detected.</p>
            )}
          </div>

          {strongTopics.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-green-500">
              <h3 className="text-xl font-bold mb-4 text-green-800">🌟 Strong Areas</h3>
              <div className="flex flex-wrap gap-2">
                {strongTopics.map((st: any, idx: number) => (
                  <span key={idx} className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
                    {st.subtopic} ({st.accuracy}%)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Topic Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-xl font-bold mb-6">Topic Breakdown</h3>
          <SubtopicBreakdown breakdown={breakdown} />
        </div>
      </div>

      <div className="text-center mt-8">
        <button 
          onClick={onBack}
          className="px-8 py-3 bg-gray-800 text-white font-bold rounded shadow hover:bg-gray-900 transition"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
};
