import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api';

interface MemoryMatchProps {
  topicId: string;
  topicName: string;
  onGameComplete: () => void;
}

interface Card {
  id: number;
  text: string;
  type: 'term' | 'definition';
  pairId: number;
  isFlipped: boolean;
  isMatched: boolean;
}

export const MemoryMatch: React.FC<MemoryMatchProps> = ({ topicId, topicName, onGameComplete }) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matches, setMatches] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  
  const [results, setResults] = useState<{ score: number; xpEarned: number } | null>(null);

  useEffect(() => {
    loadGame();
  }, [topicId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && !gameComplete) {
      interval = setInterval(() => {
        setTimeElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, gameComplete]);

  const loadGame = async () => {
    try {
      const response = await apiClient.get<any>(`/games/mini/${topicId}/MEMORY_MATCH`);
      setSessionKey(response.sessionKey);
      
      const pairs = response.content.pairs;
      const gameCards: Card[] = [];
      
      pairs.forEach((pair: any, index: number) => {
        gameCards.push({
          id: index * 2,
          text: pair.term,
          type: 'term',
          pairId: index,
          isFlipped: false,
          isMatched: false
        });
        gameCards.push({
          id: index * 2 + 1,
          text: pair.definition,
          type: 'definition',
          pairId: index,
          isFlipped: false,
          isMatched: false
        });
      });

      // Shuffle cards
      for (let i = gameCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameCards[i], gameCards[j]] = [gameCards[j], gameCards[i]];
      }

      setCards(gameCards);
      setLoading(false);
      setTimerActive(true);
    } catch (error) {
      console.error('Failed to load memory match:', error);
      setLoading(false);
    }
  };

  const handleCardClick = (id: number) => {
    if (flippedCards.length === 2 || submitting || gameComplete) return;
    
    const cardIndex = cards.findIndex(c => c.id === id);
    if (cards[cardIndex].isFlipped || cards[cardIndex].isMatched) return;

    const newCards = [...cards];
    newCards[cardIndex].isFlipped = true;
    setCards(newCards);

    const newFlipped = [...flippedCards, id];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      checkMatch(newFlipped, newCards);
    }
  };

  const checkMatch = (flippedIds: number[], currentCards: Card[]) => {
    const card1 = currentCards.find(c => c.id === flippedIds[0])!;
    const card2 = currentCards.find(c => c.id === flippedIds[1])!;

    if (card1.pairId === card2.pairId && card1.type !== card2.type) {
      // Match found
      setTimeout(() => {
        const newCards = currentCards.map(c => 
          flippedIds.includes(c.id) ? { ...c, isMatched: true } : c
        );
        setCards(newCards);
        setFlippedCards([]);
        setMatches(m => {
          const newMatches = m + 1;
          if (newMatches === currentCards.length / 2) {
            submitGame(newMatches, mistakes);
          }
          return newMatches;
        });
      }, 500);
    } else {
      // No match
      setMistakes(m => m + 1);
      setTimeout(() => {
        const newCards = currentCards.map(c => 
          flippedIds.includes(c.id) ? { ...c, isFlipped: false } : c
        );
        setCards(newCards);
        setFlippedCards([]);
      }, 1000);
    }
  };

  const submitGame = async (finalMatches: number, finalMistakes: number) => {
    setTimerActive(false);
    setSubmitting(true);
    
    // Calculate score based on mistakes. Max pairs is 8.
    // 0 mistakes = 100%. Each mistake drops score, down to minimum 20%.
    const maxScore = 100;
    const penaltyPerMistake = 5;
    const score = Math.max(20, maxScore - (finalMistakes * penaltyPerMistake));

    try {
      const response = await apiClient.post<any>('/games/mini/submit', {
        sessionKey,
        topicId,
        gameType: 'MEMORY_MATCH',
        score,
        durationSec: timeElapsed,
        details: { mistakes: finalMistakes }
      });

      setResults(response);
      setGameComplete(true);
    } catch (error) {
      console.error('Failed to submit game:', error);
      alert('Failed to submit game results.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="text-4xl mb-4">🧠</div>
        <div className="text-xl font-semibold text-indigo-600 animate-pulse">
          Generating Cards with LLM...
        </div>
      </div>
    );
  }

  if (gameComplete && results) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl text-center">
        <h2 className="text-4xl font-black text-gray-900 mb-6">🎉 Game Complete!</h2>
        
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
            <p className="text-indigo-600 font-bold mb-1 uppercase tracking-wider text-sm">Score</p>
            <p className="text-5xl font-black text-indigo-700">{results.score}%</p>
          </div>
          <div className="bg-green-50 p-6 rounded-xl border border-green-100">
            <p className="text-green-600 font-bold mb-1 uppercase tracking-wider text-sm">XP Earned</p>
            <p className="text-5xl font-black text-green-600">+{results.xpEarned}</p>
          </div>
        </div>

        <div className="flex justify-center gap-6 mb-8 text-gray-600 font-medium">
          <div className="flex items-center"><span className="text-xl mr-2">⏱️</span> {formatTime(timeElapsed)}</div>
          <div className="flex items-center"><span className="text-xl mr-2">❌</span> {mistakes} Mistakes</div>
        </div>

        <button
          onClick={onGameComplete}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold rounded-xl transition-colors shadow-md"
        >
          Back to Arcade
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Memory Match: {topicName}</h2>
          <p className="text-gray-500 text-sm mt-1">Match the terms with their definitions.</p>
        </div>
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-xs font-bold text-gray-400 uppercase">Mistakes</div>
            <div className="text-xl font-bold text-red-500">{mistakes}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-bold text-gray-400 uppercase">Time</div>
            <div className="text-xl font-bold text-indigo-600">{formatTime(timeElapsed)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {cards.map(card => (
          <div 
            key={card.id}
            onClick={() => handleCardClick(card.id)}
            className={`
              relative h-32 md:h-40 cursor-pointer transition-all duration-500
              ${card.isMatched ? 'opacity-0 invisible' : 'opacity-100'}
            `}
            style={{ perspective: '1000px' }}
          >
            <div 
              className={`
                w-full h-full absolute top-0 left-0 transition-transform duration-500 rounded-xl shadow-md
                ${card.isFlipped ? '' : 'rotate-y-180'}
              `}
              style={{ 
                transformStyle: 'preserve-3d', 
                transform: card.isFlipped ? 'rotateY(0deg)' : 'rotateY(180deg)' 
              }}
            >
              {/* Front (Hidden state) */}
              <div 
                className="w-full h-full absolute top-0 left-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-4xl shadow-inner border-2 border-indigo-400"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <span className="opacity-50 text-white">🧠</span>
              </div>
              
              {/* Back (Revealed state) */}
              <div 
                className={`
                  w-full h-full absolute top-0 left-0 rounded-xl flex items-center justify-center p-4 text-center border-2
                  ${card.type === 'term' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}
                `}
                style={{ backfaceVisibility: 'hidden' }}
              >
                <span className={`
                  ${card.type === 'term' ? 'font-black text-lg text-blue-800' : 'font-medium text-sm text-orange-900'}
                `}>
                  {card.text}
                </span>
                <div className="absolute bottom-2 right-2 text-xs opacity-30 font-bold uppercase">
                  {card.type}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
