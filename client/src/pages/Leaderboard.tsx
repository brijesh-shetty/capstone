import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface LeaderboardUser {
  id: string;
  name: string;
  level: number;
  xpTotal: number;
  streakDays: number;
  rank?: number;
}

interface LeaderboardData {
  leaderboard: LeaderboardUser[];
  currentUser: LeaderboardUser | null;
}

export const LeaderboardPage: React.FC = () => {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<LeaderboardData>('/leaderboard')
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load leaderboard', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-center py-12">Loading leaderboard...</div>;
  if (!data) return <div className="text-center py-12">Failed to load leaderboard</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-yellow-400 to-orange-500 p-8 rounded-lg shadow-lg text-white mb-8">
        <h2 className="text-4xl font-bold text-center mb-2">🏆 Global Leaderboard</h2>
        <p className="text-center text-yellow-100">Top learners by Total XP</p>
      </div>

      {data.currentUser && (
        <div className="bg-indigo-50 border-2 border-indigo-200 p-4 rounded-lg shadow mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500 text-white rounded-full flex items-center justify-center font-bold text-xl">
              #{data.currentUser.rank}
            </div>
            <div>
              <p className="font-bold text-lg text-indigo-900">Your Rank</p>
              <p className="text-sm text-indigo-700">Level {data.currentUser.level} • {data.currentUser.xpTotal} XP • 🔥 {data.currentUser.streakDays} Day Streak</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-4 font-semibold text-gray-600">Rank</th>
              <th className="px-6 py-4 font-semibold text-gray-600">Student</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-right">Streak</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-right">XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.leaderboard.map((user, idx) => {
              const rank = idx + 1;
              const isCurrentUser = data.currentUser?.id === user.id;
              
              let rankBadge = <span className="text-gray-500 font-bold">#{rank}</span>;
              if (rank === 1) rankBadge = <span className="text-2xl" title="1st Place">🥇</span>;
              if (rank === 2) rankBadge = <span className="text-2xl" title="2nd Place">🥈</span>;
              if (rank === 3) rankBadge = <span className="text-2xl" title="3rd Place">🥉</span>;

              return (
                <tr key={user.id} className={`hover:bg-gray-50 ${isCurrentUser ? 'bg-indigo-50/50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap w-24 text-center">
                    {rankBadge}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-white flex items-center justify-center font-bold shadow-inner">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{user.name} {isCurrentUser && '(You)'}</p>
                        <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Level {user.level}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {user.streakDays > 0 ? (
                      <span className="inline-flex items-center gap-1 font-bold text-orange-500">
                        🔥 {user.streakDays}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-indigo-600">
                    {user.xpTotal.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
