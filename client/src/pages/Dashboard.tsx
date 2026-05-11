import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  level: number;
  xpTotal: number;
  streakDays: number;
}

interface AchievementData {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface DashboardPageProps {
  user: User;
  setCurrentPage: (page: string) => void;
}

const LEVEL_THRESHOLDS = [0, 500, 1200, 2000, 3200, 5000, 8000, 12000, 18000];
const LEVEL_NAMES = [
  'Rookie',
  'Explorer',
  'Apprentice',
  'Scholar',
  'Expert',
  'Master',
  'Champion',
  'Legend',
  'Grandmaster'
];

export const DashboardPage: React.FC<DashboardPageProps> = ({ user, setCurrentPage }) => {
  const [userStats, setUserStats] = useState(user);
  const [stats, setStats] = useState({
    gamesPlayed: 0,
    totalXp: user.xpTotal,
    currentLevel: user.level,
    nextLevelXp: LEVEL_THRESHOLDS[user.level] || 0,
    currentLevelXp: LEVEL_THRESHOLDS[user.level - 1] || 0
  });

  const [recentAchievements, setRecentAchievements] = useState<AchievementData[]>([]);

  useEffect(() => {
    setStats({
      gamesPlayed: 0,
      totalXp: user.xpTotal,
      currentLevel: user.level,
      nextLevelXp: LEVEL_THRESHOLDS[user.level] || 0,
      currentLevelXp: LEVEL_THRESHOLDS[user.level - 1] || 0
    });

    const fetchRecent = async () => {
      try {
        const data = await apiClient.get<AchievementData[]>('/achievements/recent');
        setRecentAchievements(data);
      } catch (e) {
        console.error(e);
      }
    };
    fetchRecent();
  }, [user]);

  const xpProgress = ((stats.totalXp - stats.currentLevelXp) / (stats.nextLevelXp - stats.currentLevelXp)) * 100;
  const levelName = LEVEL_NAMES[stats.currentLevel - 1] || 'Unknown';

  return (
    <div className="max-w-6xl mx-auto">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-8 rounded-lg shadow-lg mb-6">
        <h2 className="text-3xl font-bold mb-2">Welcome, {user.name}! 👋</h2>
        <p className="text-blue-100">Keep learning and climbing the leaderboard!</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Level Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">Current Level</p>
            <p className="text-5xl font-bold text-indigo-600 mb-2">{stats.currentLevel}</p>
            <p className="text-lg text-gray-700 font-semibold">{levelName}</p>
          </div>
        </div>

        {/* XP Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">Total XP</p>
            <p className="text-4xl font-bold text-green-600 mb-2">{stats.totalXp}</p>
            <p className="text-xs text-gray-500">
              {stats.totalXp - stats.currentLevelXp} / {stats.nextLevelXp - stats.currentLevelXp}
            </p>
          </div>
        </div>

        {/* Streak Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">Daily Streak</p>
            <p className="text-5xl font-bold text-orange-600 mb-2">{user.streakDays}</p>
            <p className="text-sm text-gray-700">🔥 days</p>
          </div>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
        <h3 className="font-bold text-lg mb-3">Progress to Next Level</h3>
        <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
          <div
            className="bg-gradient-to-r from-green-400 to-blue-500 h-4 rounded-full transition-all"
            style={{ width: `${Math.min(xpProgress, 100)}%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-600">
          {stats.totalXp - stats.currentLevelXp} / {stats.nextLevelXp - stats.currentLevelXp} XP
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => setCurrentPage('domains')}
          className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-black text-xl py-6 px-6 rounded-xl shadow-lg transition transform hover:-translate-y-1"
        >
          🚀 Learning Domains
        </button>
        <button
          onClick={() => setCurrentPage('interview-hub')}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-xl py-6 px-6 rounded-xl shadow-lg transition transform hover:-translate-y-1"
        >
          🎯 Interview Prep
        </button>
        <button
          onClick={() => setCurrentPage('leaderboard')}
          className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-black text-xl py-6 px-6 rounded-xl shadow-lg transition transform hover:-translate-y-1"
        >
          📊 Leaderboard
        </button>
        <button
          onClick={() => setCurrentPage('achievements')}
          className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-black text-xl py-6 px-6 rounded-xl shadow-lg transition transform hover:-translate-y-1"
        >
          🏆 Trophy Room
        </button>
      </div>

      {/* Recent Achievements */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <h3 className="font-bold text-xl mb-4">✨ Recent Achievements</h3>
        {recentAchievements.length === 0 ? (
          <p className="text-gray-500 italic">No achievements yet. Start playing to earn some!</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentAchievements.map((a) => (
              <div key={a.id} className="flex items-center p-4 bg-yellow-50 border border-yellow-100 rounded-xl">
                <span className="text-3xl mr-4">{a.icon}</span>
                <div className="flex-1">
                  <p className="font-bold text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-600">{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
