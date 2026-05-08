import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface TestSetupProps {
  onStartTest: (testSessionKey: string, questions: any[], config: any) => void;
  onBack: () => void;
}

export const TestSetup: React.FC<TestSetupProps> = ({ onStartTest, onBack }) => {
  const [testType, setTestType] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(30);
  const [timeLimitMin, setTimeLimitMin] = useState(30);
  const [difficulty, setDifficulty] = useState(2);
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState<any>(null);

  useEffect(() => {
    apiClient.get<any>('/tests/setup')
      .then(setSetupData)
      .catch(err => console.error('Failed to load setup', err));
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      const data = await apiClient.post<any>('/tests/generate', {
        testType,
        questionCount,
        timeLimitMin,
        difficulty
      });
      onStartTest(data.testSessionKey, data.questions, data.config);
    } catch (error: any) {
      alert(error.message || 'Failed to generate test. Make sure you have the COLLEGE_STUDENT role.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-6 text-center text-indigo-800">Competitive Exam Portal</h2>
      <p className="text-gray-600 text-center mb-8">Configure your mock test parameters below.</p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold mb-2">Exam Type</label>
          <div className="grid grid-cols-3 gap-4">
            {['aptitude', 'verbal', 'mixed'].map(type => (
              <button
                key={type}
                onClick={() => setTestType(type)}
                className={`py-3 px-4 rounded border font-medium capitalize ${
                  testType === type 
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700' 
                    : 'bg-white hover:bg-gray-50 border-gray-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Number of Questions</label>
          <input 
            type="range" 
            min="10" max="50" step="10" 
            value={questionCount} 
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="text-center font-bold text-lg mt-2 text-indigo-600">{questionCount} Questions</div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Time Limit (Minutes)</label>
          <div className="grid grid-cols-5 gap-2">
            {[10, 20, 30, 45, 60].map(mins => (
              <button
                key={mins}
                onClick={() => setTimeLimitMin(mins)}
                className={`py-2 rounded border text-sm font-medium ${
                  timeLimitMin === mins 
                    ? 'bg-blue-50 border-blue-500 text-blue-700' 
                    : 'bg-white hover:bg-gray-50 border-gray-300'
                }`}
              >
                {mins}m
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Difficulty</label>
          <div className="grid grid-cols-3 gap-4">
            {[{v: 1, l: 'Easy'}, {v: 2, l: 'Medium'}, {v: 3, l: 'Hard'}].map(diff => (
              <button
                key={diff.v}
                onClick={() => setDifficulty(diff.v)}
                className={`py-2 rounded border font-medium ${
                  difficulty === diff.v 
                    ? 'bg-green-50 border-green-500 text-green-700' 
                    : 'bg-white hover:bg-gray-50 border-gray-300'
                }`}
              >
                {diff.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-10 flex gap-4">
        <button
          onClick={onBack}
          className="w-1/3 py-4 bg-gray-100 text-gray-700 rounded-lg font-bold hover:bg-gray-200 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleStart}
          disabled={loading || !setupData}
          className="w-2/3 py-4 bg-indigo-600 text-white rounded-lg font-bold shadow hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {loading ? 'Generating Exam...' : 'Start Mock Exam'}
        </button>
      </div>
    </div>
  );
};
