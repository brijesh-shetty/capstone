import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api';

interface CrosswordPuzzleProps {
  topicId: string;
  topicName: string;
  onGameComplete: () => void;
}

interface Clue {
  clue: string;
  answer: string;
}

export const CrosswordPuzzle: React.FC<CrosswordPuzzleProps> = ({ topicId, topicName, onGameComplete }) => {
  const [clues, setClues] = useState<Clue[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
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
      // NOTE: A true interactive crossword grid requires complex 2D placement logic.
      // To keep this frontend robust and responsive, we are implementing a "Flashcard / Clue List" style 
      // crossword game where players answer clues one by one sequentially.
      const response = await apiClient.get<any>(`/games/mini/${topicId}/CROSSWORD`);
      setSessionKey(response.sessionKey);
      
      const gameClues = response.content.clues.map((c: any) => ({
        clue: c.clue,
        answer: c.answer.toUpperCase()
      }));
      
      setClues(gameClues);
      setLoading(false);
      setTimerActive(true);
    } catch (error) {
      console.error('Failed to load crossword:', error);
      setLoading(false);
    }
  };

  const handleNextClue = (correct: boolean) => {
    if (correct) {
      setScore(s => s + 1);
    }

    if (currentIndex < clues.length - 1) {
      setCurrentIndex(i => i + 1);
      setInput('');
    } else {
      submitGame(correct ? score + 1 : score);
    }
  };

  const checkAnswer = () => {
    const currentClue = clues[currentIndex];
    if (input.toUpperCase() === currentClue.answer) {
      handleNextClue(true);
    } else {
      alert(`Incorrect! The correct answer was: ${currentClue.answer}`);
      handleNextClue(false);
    }
  };

  const submitGame = async (finalScore: number) => {
    setTimerActive(false);
    setSubmitting(true);
    
    const percentage = Math.round((finalScore / clues.length) * 100);

    try {
      const response = await apiClient.post<any>('/games/mini/submit', {
        sessionKey,
        topicId,
        gameType: 'CROSSWORD',
        score: percentage,
        durationSec: timeElapsed
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
        <div className="text-4xl mb-4">📝</div>
        <div className="text-xl font-semibold text-indigo-600 animate-pulse">
          Generating Crossword Clues...
        </div>
      </div>
    );
  }

  if (gameComplete && results) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl text-center">
        <h2 className="text-4xl font-black text-gray-900 mb-6">🎉 Clues Solved!</h2>
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
          You solved {score} out of {clues.length} clues in {formatTime(timeElapsed)}!
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

  const currentClue = clues[currentIndex];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Crossword Clues</h2>
            <p className="text-emerald-100">{topicName}</p>
          </div>
          <div className="flex gap-4 text-center">
            <div className="bg-black bg-opacity-20 rounded-lg p-2 min-w-20">
              <div className="text-xs font-bold text-emerald-200 uppercase tracking-wide">Clue</div>
              <div className="text-xl font-bold">{currentIndex + 1}/{clues.length}</div>
            </div>
            <div className="bg-black bg-opacity-20 rounded-lg p-2 min-w-20">
              <div className="text-xs font-bold text-emerald-200 uppercase tracking-wide">Time</div>
              <div className="text-xl font-bold">{formatTime(timeElapsed)}</div>
            </div>
          </div>
        </div>

        {/* Game Area */}
        <div className="p-8 md:p-12 text-center">
          
          <div className="mb-8 bg-gray-50 p-8 rounded-xl border border-gray-200">
            <p className="text-gray-500 font-bold tracking-widest uppercase text-sm mb-4">Clue {currentIndex + 1} Across/Down</p>
            <p className="text-2xl text-gray-800 font-medium">
              {currentClue.clue}
            </p>
            <p className="mt-4 text-sm font-bold text-emerald-600 uppercase">
              ({currentClue.answer.length} letters)
            </p>
          </div>

          <div className="mb-8 flex justify-center gap-1 flex-wrap">
            {/* Visual indicator of word length */}
            {Array.from({ length: currentClue.answer.length }).map((_, i) => (
              <div key={i} className="w-8 h-8 md:w-10 md:h-10 border-2 border-gray-300 bg-gray-100 flex items-center justify-center font-bold text-gray-800">
                {input[i] || ''}
              </div>
            ))}
          </div>

          <form 
            onSubmit={(e) => { e.preventDefault(); checkAnswer(); }}
            className="max-w-md mx-auto"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                  if (val.length <= currentClue.answer.length) setInput(val);
                }}
                placeholder="Type answer..."
                className="flex-1 px-4 py-4 border-2 border-emerald-200 rounded-xl text-xl font-bold text-center focus:border-emerald-500 focus:outline-none uppercase tracking-widest shadow-inner"
                autoFocus
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={input.length !== currentClue.answer.length || submitting}
                className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-bold rounded-xl transition-colors shadow-md"
              >
                Submit
              </button>
            </div>
          </form>
          
          <button 
            onClick={() => handleNextClue(false)}
            className="mt-6 text-gray-400 hover:text-gray-600 font-semibold"
          >
            I don't know (Skip)
          </button>
        </div>

      </div>
    </div>
  );
};
