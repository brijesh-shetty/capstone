import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

export interface AchievementData {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  xpReward: number;
  isEarned: boolean;
  earnedAt: string | null;
}

export const AchievementsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [achievements, setAchievements] = useState<AchievementData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const fetchAchievements = async () => {
      try {
        const response = await apiClient.get<AchievementData[]>('/achievements');
        setAchievements(response);
      } catch (error) {
        console.error('Failed to load achievements', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAchievements();
  }, []);

  if (loading) {
    return <div className="text-center py-20 text-xl font-bold animate-pulse">Loading Achievements...</div>;
  }

  const earnedCount = achievements.filter(a => a.isEarned).length;
  
  const filtered = filter === 'all' 
    ? achievements 
    : achievements.filter(a => a.category === filter);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20">
      <div className="flex items-center mb-8">
        <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-semibold mr-4">
          &larr; Back to Dashboard
        </button>
        <h1 className="text-4xl font-extrabold text-gray-900 flex-grow">Trophy Room</h1>
        <div className="text-right">
          <div className="text-3xl font-black text-yellow-500">{earnedCount} / {achievements.length}</div>
          <div className="text-sm font-bold text-gray-500 uppercase tracking-widest">Unlocked</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex space-x-2 mb-8 overflow-x-auto pb-2">
        {['all', 'general', 'domain'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full font-bold text-sm capitalize ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filtered.map(a => (
          <div 
            key={a.id} 
            className={`relative rounded-2xl p-6 border-2 transition-all ${
              a.isEarned 
                ? 'bg-white border-yellow-400 shadow-xl transform hover:-translate-y-1' 
                : 'bg-gray-50 border-gray-200 opacity-70 grayscale hover:grayscale-0'
            }`}
          >
            {a.isEarned && (
              <div className="absolute -top-3 -right-3 bg-yellow-400 text-xs font-black px-2 py-1 rounded-full text-yellow-900 shadow-sm border border-yellow-200">
                EARNED
              </div>
            )}
            
            <div className="text-5xl mb-4 text-center transform hover:scale-110 transition-transform duration-300">
              {a.icon}
            </div>
            
            <h3 className={`font-bold text-lg text-center mb-2 ${a.isEarned ? 'text-gray-900' : 'text-gray-500'}`}>
              {a.name}
            </h3>
            
            <p className="text-sm text-center text-gray-600 mb-4 h-10">
              {a.description}
            </p>
            
            <div className="flex justify-between items-end border-t border-gray-100 pt-3 mt-auto">
              <span className="text-xs font-bold text-gray-400 uppercase">{a.category}</span>
              <span className={`text-sm font-bold ${a.isEarned ? 'text-green-500' : 'text-gray-400'}`}>
                +{a.xpReward} XP
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
