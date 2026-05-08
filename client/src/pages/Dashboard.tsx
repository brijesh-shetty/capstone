import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { MasteryChart } from '../components/MasteryChart';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  level: number;
  xpTotal: number;
  streakDays: number;
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

interface RecentGame {
  id: string;
  topicName: string;
  subtopic: string;
  score: number;
  xpEarned: number;
  playedAt: string;
}

interface DashboardStats {
  gamesPlayed: number;
  avgScore: number;
  recentGames: RecentGame[];
  recentTests?: Array<{
    id: string;
    testType: string;
    scoredMarks: number;
    totalMarks: number;
    takenAt: string;
  }>;
  weakTopics?: Array<{
    topicId: string;
    subject: string;
    topic: string;
    subtopic: string;
    masteryLevel: number;
  }>;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ user, setCurrentPage }) => {
  const [stats, setStats] = useState({
    gamesPlayed: 0,
    totalXp: user.xpTotal,
    currentLevel: user.level,
    nextLevelXp: LEVEL_THRESHOLDS[user.level] || 0,
    currentLevelXp: LEVEL_THRESHOLDS[user.level - 1] || 0
  });
  
  const [dashboardData, setDashboardData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setStats({
      gamesPlayed: 0,
      totalXp: user.xpTotal,
      currentLevel: user.level,
      nextLevelXp: LEVEL_THRESHOLDS[user.level] || 0,
      currentLevelXp: LEVEL_THRESHOLDS[user.level - 1] || 0
    });
    
    fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      const data = await apiClient.get<any>('/dashboard');
      setDashboardData({
        gamesPlayed: data.gamesPlayed,
        avgScore: data.avgScore,
        recentGames: data.recentGames || []
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const xpProgress = ((stats.totalXp - stats.currentLevelXp) / (stats.nextLevelXp - stats.currentLevelXp)) * 100;
  const levelName = LEVEL_NAMES[stats.currentLevel - 1] || 'Unknown';

  if (loading) {
    return <div className="text-center py-8">Loading your dashboard...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-8 rounded-lg shadow-lg mb-6">
        <h2 className="text-3xl font-bold mb-2">Welcome, {user.name}! 👋</h2>
        <p className="text-blue-100">Keep learning and climbing the leaderboard!</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Level Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">Current Level</p>
            <p className="text-4xl font-bold text-indigo-600 mb-2">{stats.currentLevel}</p>
            <p className="text-sm text-gray-700 font-semibold">{levelName}</p>
          </div>
        </div>

        {/* XP Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">Total XP</p>
            <p className="text-3xl font-bold text-green-600 mb-2">{stats.totalXp}</p>
            <p className="text-xs text-gray-500">
              {stats.totalXp - stats.currentLevelXp} / {stats.nextLevelXp - stats.currentLevelXp}
            </p>
          </div>
        </div>

        {/* Games Played Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">Games Played</p>
            <p className="text-4xl font-bold text-blue-600 mb-2">{dashboardData?.gamesPlayed || 0}</p>
            <p className="text-xs text-gray-500">Avg Score: {dashboardData?.avgScore || 0}%</p>
          </div>
        </div>

        {/* Streak Card */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="text-center">
            <p className="text-gray-600 text-sm mb-2">Daily Streak</p>
            <p className="text-4xl font-bold text-orange-600 mb-2">{user.streakDays}</p>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => setCurrentPage('search')}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg transition transform hover:scale-105"
        >
          🎮 Play Game
        </button>
        <button
          onClick={() => setCurrentPage('study-plan')}
          className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg transition transform hover:scale-105"
        >
          🎯 Study Plan
        </button>
        <button
          onClick={() => setCurrentPage('leaderboard')}
          className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg transition transform hover:scale-105"
        >
          🏆 Leaderboard
        </button>
        {user.role === 'COLLEGE_STUDENT' && (
          <button
            onClick={() => setCurrentPage('test-portal')}
            className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 px-6 rounded-lg shadow-lg transition transform hover:scale-105"
          >
            📝 Diagnostic Test
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Mastery Chart */}
        <MasteryChart />

        {/* Weak Topics */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="font-bold text-xl mb-4 text-red-700">⚠️ Needs Attention</h3>
          <div className="space-y-3">
            {dashboardData?.weakTopics && dashboardData.weakTopics.length > 0 ? (
              dashboardData.weakTopics.map((wt: any) => (
                <div key={wt.topicId} className="flex justify-between items-center p-3 bg-red-50 rounded border-l-4 border-red-500">
                  <div>
                    <p className="font-bold text-gray-800">{wt.subtopic}</p>
                    <p className="text-xs text-gray-500 uppercase">{wt.subject}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-600">{wt.masteryLevel}% Mastery</p>
                    <button 
                      onClick={() => setCurrentPage('study-plan')}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold mt-1"
                    >
                      Review →
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-green-600 font-medium">Great job! No major weak areas detected.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Recent Games */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="font-bold text-xl mb-4">🎮 Recent Games</h3>
          <div className="space-y-3">
            {dashboardData?.recentGames && dashboardData.recentGames.length > 0 ? (
              dashboardData.recentGames.map((game) => (
                <div key={game.id} className="flex items-center p-3 bg-blue-50 rounded border border-blue-100">
                  <div className="flex-1">
                    <p className="font-semibold">{game.topicName}</p>
                    <p className="text-sm text-gray-600">{game.subtopic}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600">{game.score}%</p>
                    <p className="text-xs text-green-600">+{game.xpEarned} XP</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center p-3 bg-gray-50 rounded">
                <div className="flex-1">
                  <p className="font-semibold">No games played yet</p>
                  <p className="text-sm text-gray-600">Play a game to start earning XP!</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Tests */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="font-bold text-xl mb-4">📝 Recent Exams</h3>
          <div className="space-y-3">
            {dashboardData?.recentTests && dashboardData.recentTests.length > 0 ? (
              dashboardData.recentTests.map((test: any) => {
                const percentage = Math.round((test.scoredMarks / test.totalMarks) * 100);
                return (
                  <div key={test.id} className="flex items-center p-3 bg-indigo-50 rounded border border-indigo-100">
                    <div className="flex-1">
                      <p className="font-semibold capitalize">{test.testType} Exam</p>
                      <p className="text-xs text-gray-600">{new Date(test.takenAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${percentage >= 80 ? 'text-green-600' : percentage < 60 ? 'text-red-600' : 'text-orange-600'}`}>
                        {test.scoredMarks}/{test.totalMarks} ({percentage}%)
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center p-3 bg-gray-50 rounded">
                <div className="flex-1">
                  <p className="font-semibold">No exams taken yet</p>
                  <p className="text-sm text-gray-600">Take a diagnostic test to assess your readiness!</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
