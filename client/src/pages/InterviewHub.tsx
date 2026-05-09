import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface CategoryStats {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  topicCount: number;
  userProgress: {
    totalXp: number;
    avgScore: number;
    topicsStarted: number;
  };
}

interface Props {
  onSelectCategory: (slug: string) => void;
  onBack: () => void;
}

export const InterviewHub: React.FC<Props> = ({ onSelectCategory, onBack }) => {
  const [categories, setCategories] = useState<CategoryStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await apiClient.get<CategoryStats[]>('/interview/categories');
        setCategories(data);
      } catch (e) {
        console.error('Failed to fetch interview categories', e);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center mb-6">
        <button
          onClick={onBack}
          className="mr-4 text-gray-500 hover:text-gray-800 transition"
        >
          <span className="text-2xl">←</span>
        </button>
        <h2 className="text-4xl font-bold text-gray-800">🎯 Interview Preparation</h2>
      </div>

      <p className="text-xl text-gray-600 mb-8">
        Master aptitude, logical reasoning, and verbal ability with curated question banks and study notes.
      </p>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {categories.map((category) => (
            <div
              key={category.id}
              className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition transform hover:-translate-y-1 cursor-pointer"
              onClick={() => onSelectCategory(category.slug)}
            >
              <div className="h-32 bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                <span className="text-6xl">{category.icon}</span>
              </div>
              <div className="p-6">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">{category.name}</h3>
                <p className="text-gray-600 text-sm mb-4 h-10">{category.description}</p>
                
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Topics Available</span>
                    <span className="font-bold">{category.topicCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Topics Started</span>
                    <span className="font-bold text-indigo-600">{category.userProgress.topicsStarted}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Avg Score</span>
                    <span className="font-bold text-green-600">{category.userProgress.avgScore}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
