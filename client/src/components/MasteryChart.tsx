import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface MasteryScore {
  id: string;
  topic: {
    id: string;
    subject: string;
    topic: string;
    subtopic: string;
  };
  score: number;
  isWeak: boolean;
  attemptCount: number;
}

export const MasteryChart: React.FC = () => {
  const [scores, setScores] = useState<MasteryScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMastery = async () => {
      try {
        const data = await apiClient.get<MasteryScore[]>('/mastery');
        setScores(data);
      } catch (error) {
        console.error('Failed to fetch mastery scores', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMastery();
  }, []);

  if (loading) return <div className="p-4 text-center">Loading mastery data...</div>;

  if (scores.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg text-center">
        <p className="text-gray-500">No mastery data yet. Play some games to generate your diagnostic profile!</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <h3 className="font-bold text-xl mb-6">📊 Subject Mastery Profile</h3>
      <div className="space-y-4">
        {scores.map(ms => (
          <div key={ms.id} className="relative">
            <div className="flex justify-between items-end mb-1">
              <div>
                <span className="font-semibold text-gray-800">{ms.topic.subtopic}</span>
                <span className="ml-2 text-xs text-gray-500">{ms.topic.subject}</span>
              </div>
              <div className="text-right">
                <span className={`font-bold ${ms.isWeak ? 'text-red-500' : ms.score > 80 ? 'text-green-500' : 'text-blue-500'}`}>
                  {ms.score.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full ${ms.isWeak ? 'bg-red-500' : ms.score > 80 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.max(ms.score, 5)}%` }}
              ></div>
            </div>
            {ms.isWeak && (
              <p className="text-xs text-red-500 mt-1">⚠️ Needs review. Added to Study Plan.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
