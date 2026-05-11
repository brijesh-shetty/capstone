import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { QuickNotes } from '../components/QuickNotes';

interface GameType {
  type: string;
  name: string;
  icon: string;
  description: string;
  xpBase: number | string;
}

interface GameArcadeProps {
  topicId: string;
  topicName: string;
  onSelectGame: (topicId: string, topicName: string, gameType: string) => void;
  onBack: () => void;
}

export const GameArcade: React.FC<GameArcadeProps> = ({ topicId, topicName, onSelectGame, onBack }) => {
  const [games, setGames] = useState<GameType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedGameForNotes, setSelectedGameForNotes] = useState<string | null>(null);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const response = await apiClient.get<any>(`/games/arcade/${topicId}`);
        setGames(response.games);
      } catch (err) {
        console.error('Failed to load arcade:', err);
        setError('Failed to load available games. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchGames();
  }, [topicId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl font-semibold text-gray-600 animate-pulse">
          🎮 Loading Arcade...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="bg-red-100 text-red-700 p-4 rounded-lg inline-block">
          {error}
        </div>
        <div className="mt-4">
          <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-semibold">
            &larr; Back to Topics
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-12 relative">
      {selectedGameForNotes && (
        <QuickNotes 
          topicId={topicId}
          topicName={topicName}
          gameType={selectedGameForNotes}
          onReady={() => onSelectGame(topicId, topicName, selectedGameForNotes)}
          onSkip={() => setSelectedGameForNotes(null)}
        />
      )}
      
      {/* Arcade Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-semibold mb-2 flex items-center">
            <span className="mr-2">&larr;</span> Back to Topics
          </button>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
            Game Arcade
          </h1>
          <p className="text-lg text-gray-600 mt-2">
            Topic: <span className="font-semibold text-indigo-700">{topicName}</span>
          </p>
        </div>
      </div>

      {/* Game Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {games.map((game) => (
          <div
            key={game.type}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col h-full group"
          >
            <div className="p-6 flex-grow flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="text-5xl group-hover:scale-110 transition-transform duration-300 transform origin-bottom">
                  {game.icon}
                </div>
                <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-bold flex items-center border border-indigo-100">
                  <span className="mr-1">⭐</span> 
                  {typeof game.xpBase === 'number' ? `Up to ${game.xpBase * 1.5} XP` : 'Variable XP'}
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                {game.name}
              </h3>
              
              <p className="text-gray-600 flex-grow text-sm leading-relaxed">
                {game.description}
              </p>
            </div>
            
            <div className="p-6 pt-0 mt-auto">
              <button
                onClick={() => setSelectedGameForNotes(game.type)}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all duration-200 transform active:scale-95"
              >
                Play {game.name}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
