import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface TopicData {
  id: string;
  name: string;
  slug: string;
  questionCount: number;
  hasTheory: boolean;
  progress: {
    gamesPlayed: number;
    bestScore: number;
    avgScore: number;
    totalXp: number;
  };
}

interface CategoryData {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  topics: TopicData[];
}

interface Props {
  categorySlug: string;
  onSelectTheory: (topicId: string) => void;
  onSelectQuiz: (topicId: string, topicName: string) => void;
  onSelectGames: (topicId: string, topicName: string) => void;
  onBack: () => void;
}

export const InterviewCategory: React.FC<Props> = ({ categorySlug, onSelectTheory, onSelectQuiz, onSelectGames, onBack }) => {
  const [category, setCategory] = useState<CategoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategory = async () => {
      try {
        const data = await apiClient.get<CategoryData>(`/interview/categories/${categorySlug}`);
        setCategory(data);
      } catch (e) {
        console.error('Failed to fetch category', e);
      } finally {
        setLoading(false);
      }
    };
    fetchCategory();
  }, [categorySlug]);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!category) {
    return <div className="text-center text-red-500">Category not found</div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center mb-6">
        <button
          onClick={onBack}
          className="mr-4 text-gray-500 hover:text-gray-800 transition"
        >
          <span className="text-2xl">←</span>
        </button>
        <span className="text-4xl mr-3">{category.icon}</span>
        <h2 className="text-4xl font-bold text-gray-800">{category.name}</h2>
      </div>

      <p className="text-xl text-gray-600 mb-8">{category.description}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {category.topics.map((topic) => (
          <div key={topic.id} className="bg-white rounded-xl shadow border border-gray-100 p-6 flex flex-col justify-between hover:shadow-md transition">
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-gray-800">{topic.name}</h3>
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                  {topic.questionCount} Qs
                </span>
              </div>
              
              <div className="text-sm text-gray-500 mb-4 space-y-1">
                <p>Best Score: <span className="font-bold text-green-600">{topic.progress.bestScore}%</span></p>
                <p>Sessions Played: <span className="font-bold">{topic.progress.gamesPlayed}</span></p>
                <p>Total XP: <span className="font-bold text-indigo-600">{topic.progress.totalXp}</span></p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                onClick={() => onSelectTheory(topic.id)}
                disabled={!topic.hasTheory}
                className={`flex-1 min-w-[30%] py-2 px-2 rounded font-semibold text-xs text-center transition ${
                  topic.hasTheory 
                  ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                📖 Study
              </button>
              <button
                onClick={() => onSelectGames(topic.id, topic.name)}
                disabled={!topic.hasTheory}
                className={`flex-1 min-w-[30%] py-2 px-2 rounded font-semibold text-xs text-center transition ${
                  topic.hasTheory 
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                ⚡ Games
              </button>
              <button
                onClick={() => onSelectQuiz(topic.id, topic.name)}
                disabled={topic.questionCount === 0}
                className={`flex-1 min-w-[30%] py-2 px-2 rounded font-semibold text-xs text-center transition ${
                  topic.questionCount > 0
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                🎮 Quiz
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
