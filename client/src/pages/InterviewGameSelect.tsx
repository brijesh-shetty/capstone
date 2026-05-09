import React from 'react';

interface Props {
  topicId: string;
  topicName: string;
  onSelectGame: (gameId: 'flashcards' | 'match' | 'sprint') => void;
  onBack: () => void;
}

export const InterviewGameSelect: React.FC<Props> = ({ topicName, onSelectGame, onBack }) => {
  const games = [
    {
      id: 'flashcards' as const,
      name: 'Formula Flash Cards',
      emoji: '🃏',
      desc: 'Spaced repetition flash cards to quickly memorize key formulas.',
      color: 'bg-indigo-50 border-indigo-200 hover:border-indigo-500',
      text: 'text-indigo-900',
    },
    {
      id: 'match' as const,
      name: 'Formula Match',
      emoji: '🔗',
      desc: 'Connect formula names with their mathematical expressions.',
      color: 'bg-emerald-50 border-emerald-200 hover:border-emerald-500',
      text: 'text-emerald-900',
    },
    {
      id: 'sprint' as const,
      name: 'Concept Sprint',
      emoji: '⚡',
      desc: 'Rapid-fire True/False game based on the study notes.',
      color: 'bg-amber-50 border-amber-200 hover:border-amber-500',
      text: 'text-amber-900',
    }
  ];

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex items-center mb-8">
        <button onClick={onBack} className="mr-4 text-gray-500 hover:text-gray-800 transition">
          <span className="text-2xl">←</span>
        </button>
        <h2 className="text-3xl font-bold text-gray-800">Study Games: {topicName}</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {games.map(game => (
          <button
            key={game.id}
            onClick={() => onSelectGame(game.id)}
            className={`flex flex-col text-left p-6 rounded-2xl border-2 transition-all transform hover:-translate-y-1 shadow-sm hover:shadow-lg ${game.color}`}
          >
            <div className="text-4xl mb-4">{game.emoji}</div>
            <h3 className={`text-xl font-bold mb-2 ${game.text}`}>{game.name}</h3>
            <p className="text-gray-600 flex-1">{game.desc}</p>
            <div className="mt-6 font-bold text-sm tracking-wider uppercase opacity-70">
              Play Game →
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
