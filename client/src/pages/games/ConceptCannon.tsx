import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api';

interface ConceptCannonProps {
  topicId: string;
  topicName: string;
  onGameComplete: () => void;
}

interface Concept {
  id: number;
  text: string;
  category: string;
}

export const ConceptCannon: React.FC<ConceptCannonProps> = ({ topicId, topicName, onGameComplete }) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [results, setResults] = useState<{ score: number; xpEarned: number } | null>(null);

  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(10); // time to sort current concept
  const [totalTime, setTotalTime] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  
  const MAX_MISTAKES = 3;

  useEffect(() => {
    loadGame();
  }, [topicId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && !gameComplete) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleSort(null); // Time's up
            return 10; // Slightly faster each time? Keep it 10 for simplicity
          }
          return prev - 1;
        });
        setTotalTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, gameComplete, currentIndex]);

  const loadGame = async () => {
    try {
      const response = await apiClient.get<any>(`/games/mini/${topicId}/CONCEPT_CANNON`);
      setSessionKey(response.sessionKey);
      
      setCategories(response.content.categories);
      
      const gameConcepts = response.content.items.map((item: any, idx: number) => ({
        id: idx,
        text: item.concept,
        category: item.category
      }));
      
      // Shuffle concepts
      for (let i = gameConcepts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameConcepts[i], gameConcepts[j]] = [gameConcepts[j], gameConcepts[i]];
      }
      
      setConcepts(gameConcepts);
      setLoading(false);
      setTimerActive(true);
    } catch (error) {
      console.error('Failed to load concept cannon:', error);
      setLoading(false);
    }
  };

  const handleSort = (selectedCategory: string | null) => {
    const currentConcept = concepts[currentIndex];
    
    if (selectedCategory === currentConcept.category) {
      setScore(s => s + 1);
    } else {
      setMistakes(m => m + 1);
      if (mistakes + 1 >= MAX_MISTAKES) {
        // Game Over
        submitGame(score);
        return;
      }
    }

    if (currentIndex < concepts.length - 1) {
      setCurrentIndex(i => i + 1);
      setTimeRemaining(Math.max(3, 10 - Math.floor(currentIndex / 3))); // Speeds up!
    } else {
      submitGame(selectedCategory === currentConcept.category ? score + 1 : score);
    }
  };

  const submitGame = async (finalScore: number) => {
    setTimerActive(false);
    setSubmitting(true);
    
    const percentage = Math.round((finalScore / concepts.length) * 100);

    try {
      const response = await apiClient.post<any>('/games/mini/submit', {
        sessionKey,
        topicId,
        gameType: 'CONCEPT_CANNON',
        score: percentage,
        durationSec: totalTime
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

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="text-4xl mb-4">🎯</div>
        <div className="text-xl font-semibold text-indigo-600 animate-pulse">
          Loading Concept Cannon...
        </div>
      </div>
    );
  }

  if (gameComplete && results) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl text-center">
        <h2 className="text-4xl font-black text-gray-900 mb-6">
          {mistakes >= MAX_MISTAKES ? '💥 Game Over!' : '🎉 Level Cleared!'}
        </h2>
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
        <p className="text-gray-600 mb-8 font-medium">
          You sorted {score} out of {concepts.length} concepts correctly.
        </p>
        <button
          onClick={onGameComplete}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold rounded-xl transition-colors shadow-md"
        >
          Back to Arcade
        </button>
      </div>
    );
  }

  const currentConcept = concepts[currentIndex];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 relative h-[600px] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 p-4 text-white flex justify-between items-center z-10">
          <div>
            <h2 className="text-xl font-bold">Concept Cannon</h2>
            <p className="text-red-100 text-sm">{topicName}</p>
          </div>
          <div className="flex gap-4 text-center">
            <div className="bg-black bg-opacity-20 rounded-lg px-3 py-1">
              <div className="text-xs font-bold text-red-200 uppercase">Lives</div>
              <div className="text-lg font-bold">{'❤️'.repeat(MAX_MISTAKES - mistakes)}</div>
            </div>
            <div className="bg-black bg-opacity-20 rounded-lg px-3 py-1">
              <div className="text-xs font-bold text-red-200 uppercase">Progress</div>
              <div className="text-lg font-bold">{currentIndex + 1}/{concepts.length}</div>
            </div>
          </div>
        </div>

        {/* Game Area */}
        <div className="flex-1 bg-gray-900 relative overflow-hidden">
          
          {/* Falling Concept */}
          <div 
            className="absolute left-1/2 transform -translate-x-1/2 bg-white px-8 py-4 rounded-full shadow-2xl border-4 border-indigo-500 text-center z-20 transition-all ease-linear"
            style={{
              top: `${((10 - timeRemaining) / 10) * 80}%`, // Falls down the screen
              transitionDuration: '1000ms'
            }}
          >
            <span className="text-2xl font-black text-gray-800 tracking-wide">
              {currentConcept.text}
            </span>
            <div className="text-xs text-gray-400 mt-1 uppercase font-bold">Sort this!</div>
          </div>

          {/* Warning line */}
          <div className="absolute bottom-32 w-full border-t-2 border-dashed border-red-500 opacity-50"></div>

        </div>

        {/* Buckets */}
        <div className="h-32 bg-gray-800 flex justify-around items-end pb-4 px-4 gap-4 z-10">
          {categories.map((cat, idx) => {
            const colors = [
              'bg-blue-500 hover:bg-blue-400',
              'bg-green-500 hover:bg-green-400',
              'bg-purple-500 hover:bg-purple-400',
              'bg-yellow-500 hover:bg-yellow-400'
            ];
            const color = colors[idx % colors.length];
            
            return (
              <button
                key={idx}
                onClick={() => handleSort(cat)}
                disabled={submitting}
                className={`flex-1 h-24 ${color} rounded-t-xl border-t-4 border-white border-opacity-20 flex items-center justify-center text-white font-bold text-lg shadow-lg transform transition-transform hover:-translate-y-2 active:translate-y-0 px-2 text-center`}
              >
                {cat}
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
};
