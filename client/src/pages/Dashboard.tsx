import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
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

const QUICK_ACTIONS = [
  {
    page: 'domains',
    icon: '🚀',
    title: 'Learning Domains',
    desc: 'Explore 8 domains and 35 topics through games',
    accent: 'from-blue-500 to-indigo-600',
    tint: 'bg-blue-50 text-blue-600 group-hover:bg-blue-100',
  },
  {
    page: 'interview-hub',
    icon: '🎯',
    title: 'Interview Prep',
    desc: 'Aptitude, reasoning & verbal question banks',
    accent: 'from-emerald-500 to-teal-600',
    tint: 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100',
  },
  {
    page: 'assessments',
    icon: '📝',
    title: 'Mock Tests',
    desc: 'Timed, proctored assessments with analysis',
    accent: 'from-rose-500 to-red-600',
    tint: 'bg-rose-50 text-rose-600 group-hover:bg-rose-100',
  },
  {
    page: 'ai-interview',
    icon: '🤖',
    title: 'AI Interview',
    desc: 'Live voice interview with an AI interviewer',
    accent: 'from-violet-500 to-fuchsia-600',
    tint: 'bg-violet-50 text-violet-600 group-hover:bg-violet-100',
  },
  {
    page: 'leaderboard',
    icon: '📊',
    title: 'Leaderboard',
    desc: 'See where you rank among all learners',
    accent: 'from-purple-500 to-pink-600',
    tint: 'bg-purple-50 text-purple-600 group-hover:bg-purple-100',
  },
  {
    page: 'achievements',
    icon: '🏆',
    title: 'Trophy Room',
    desc: 'Browse every achievement you have unlocked',
    accent: 'from-amber-400 to-orange-500',
    tint: 'bg-amber-50 text-amber-600 group-hover:bg-amber-100',
  },
];

const ADMIN_ACTIONS = [
  { page: 'review-queue', icon: '🔍', title: 'Question Review Queue', desc: 'Approve or reject flagged questions' },
  { page: 'test-builder', icon: '🛠️', title: 'Test Builder', desc: 'Compose and publish mock tests' },
  { page: 'admin-reports', icon: '📈', title: 'Attempt Reports', desc: 'Review student attempts and proctoring' },
];

export const DashboardPage: React.FC<DashboardPageProps> = ({ user, setCurrentPage }) => {
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
  const xpIntoLevel = stats.totalXp - stats.currentLevelXp;
  const xpForLevel = stats.nextLevelXp - stats.currentLevelXp;

  return (
    <div className="max-w-6xl mx-auto animate-fade-in-up">
      {/* Welcome Hero */}
      <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white p-8 md:p-10 rounded-3xl shadow-lift mb-6">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-20 right-32 w-48 h-48 bg-fuchsia-400/20 rounded-full blur-2xl" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <p className="text-indigo-200 font-medium mb-1">Good to see you again</p>
            <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Welcome, {user.name}! 👋</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-sm font-semibold border border-white/20">
                ⭐ Level {stats.currentLevel} · {levelName}
              </span>
              <span className="px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-sm font-semibold border border-white/20">
                🔥 {user.streakDays}-day streak
              </span>
            </div>
          </div>
          <div className="text-center md:text-right">
            <p className="text-5xl font-extrabold">{stats.totalXp.toLocaleString()}</p>
            <p className="text-indigo-200 font-medium">Total XP earned</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card card-hover p-6 flex items-center gap-4">
          <div className="w-14 h-14 flex items-center justify-center text-2xl bg-indigo-50 rounded-2xl">⭐</div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Current Level</p>
            <p className="text-3xl font-extrabold text-gray-900">
              {stats.currentLevel} <span className="text-base font-semibold text-indigo-600">{levelName}</span>
            </p>
          </div>
        </div>

        <div className="card card-hover p-6 flex items-center gap-4">
          <div className="w-14 h-14 flex items-center justify-center text-2xl bg-emerald-50 rounded-2xl">⚡</div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total XP</p>
            <p className="text-3xl font-extrabold text-gray-900">{stats.totalXp.toLocaleString()}</p>
            <p className="text-xs text-gray-400">{xpIntoLevel} / {xpForLevel} this level</p>
          </div>
        </div>

        <div className="card card-hover p-6 flex items-center gap-4">
          <div className="w-14 h-14 flex items-center justify-center text-2xl bg-orange-50 rounded-2xl">🔥</div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Daily Streak</p>
            <p className="text-3xl font-extrabold text-gray-900">
              {user.streakDays} <span className="text-base font-semibold text-orange-500">days</span>
            </p>
          </div>
        </div>
      </div>

      {/* XP Progress Bar */}
      <div className="card p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg text-gray-900">Progress to Level {stats.currentLevel + 1}</h3>
          <span className="text-sm font-bold text-indigo-600">{Math.min(Math.round(xpProgress), 100)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3.5 mb-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 h-3.5 rounded-full animate-progress-grow transition-all"
            style={{ width: `${Math.min(xpProgress, 100)}%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-500">
          {xpIntoLevel} / {xpForLevel} XP — {Math.max(xpForLevel - xpIntoLevel, 0)} XP to go
        </p>
      </div>

      {/* Quick Actions */}
      <h3 className="font-extrabold text-xl text-gray-900 mb-4">Jump back in</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.page}
            onClick={() => setCurrentPage(action.page)}
            className="card card-hover group relative overflow-hidden p-6 text-left"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${action.accent}`} />
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 shrink-0 flex items-center justify-center text-2xl rounded-xl transition-colors ${action.tint}`}>
                {action.icon}
              </div>
              <div className="flex-1">
                <p className="font-bold text-gray-900 group-hover:text-indigo-700 transition-colors">
                  {action.title}
                </p>
                <p className="text-sm text-gray-500 mt-0.5 leading-snug">{action.desc}</p>
              </div>
              <span className="text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all font-bold">
                →
              </span>
            </div>
          </button>
        ))}
      </div>

      {(user.role === 'ADMIN' || user.role === 'EDUCATOR') && (
        <>
          <h3 className="font-extrabold text-xl text-gray-900 mb-4">Educator Tools</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {ADMIN_ACTIONS.map((action) => (
              <button
                key={action.page}
                onClick={() => setCurrentPage(action.page)}
                className="card card-hover group p-5 text-left border-dashed"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 shrink-0 flex items-center justify-center text-xl bg-slate-100 rounded-xl group-hover:bg-slate-200 transition-colors">
                    {action.icon}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">{action.title}</p>
                    <p className="text-xs text-gray-500">{action.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Recent Achievements */}
      <div className="card p-6">
        <h3 className="font-extrabold text-xl text-gray-900 mb-4">✨ Recent Achievements</h3>
        {recentAchievements.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🎯</div>
            <p className="text-gray-500 font-medium">No achievements yet</p>
            <p className="text-sm text-gray-400">Start playing to earn your first one!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {recentAchievements.map((a) => (
              <div
                key={a.id}
                className="flex items-center p-4 bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100 rounded-2xl card-hover"
              >
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
