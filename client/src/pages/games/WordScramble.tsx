import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api';

interface WordScrambleProps {
  topicId: string;
  topicName: string;
  onGameComplete: () => void;
}

interface Word {
  original: string;
  scrambled: string;
  hint: string;
}

export const WordScramble: React.FC<WordScrambleProps> = ({ topicId, topicName, onGameComplete }) => {
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [results, setResults] = useState<{ score: number; xpEarned: number } | null>(null);

  const [input, setInput] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [totalTime, setTotalTime] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [score, setScore] = useState(0); // number of correct words

  useEffect(() => {
    loadGame();
  }, [topicId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && !gameComplete) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            handleNextWord(false);
            return 30; // Reset for next word if we don't end game
          }
          return prev - 1;
        });
        setTotalTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, gameComplete, currentIndex]);

  const scrambleString = (str: string) => {
    let arr = str.split('');
    // Scramble until it's different from original (if length > 1)
    let scrambled = str;
    let attempts = 0;
    while (scrambled === str && attempts < 10 && str.length > 1) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      scrambled = arr.join('');
      attempts++;
    }
    return scrambled;
  };

  const loadGame = async () => {
    try {
      const response = await apiClient.get<any>(`/games/mini/${topicId}/WORD_SCRAMBLE`);
      setSessionKey(response.sessionKey);
      
      const gameWords = response.content.words.map((w: any) => ({
        original: w.original.toUpperCase(),
        scrambled: scrambleString(w.original.toUpperCase()),
        hint: w.hint
      }));
      
      setWords(gameWords);
      setLoading(false);
      setTimerActive(true);
    } catch (error) {
      console.error('Failed to load word scramble:', error);
      setLoading(false);
    }
  };

  const handleNextWord = (correct: boolean) => {
    if (correct) {
      setScore((s) => s + 1);
    }
    
    if (currentIndex < words.length - 1) {
      setCurrentIndex((i) => i + 1);
      setInput('');
      setTimeRemaining(30);
    } else {
      // Game over
      const finalScore = correct ? score + 1 : score;
      submitGame(finalScore);
    }
  };

  const checkAnswer = () => {
    const currentWord = words[currentIndex].original;
    if (input.toUpperCase() === currentWord) {
      handleNextWord(true);
    } else {
      // Shake animation could be added here
      alert('Incorrect! Try again.');
      setInput('');
    }
  };

  const submitGame = async (finalScore: number) => {
    setTimerActive(false);
    setSubmitting(true);
    
    const percentage = Math.round((finalScore / words.length) * 100);

    try {
      const response = await apiClient.post<any>('/games/mini/submit', {
        sessionKey,
        topicId,
        gameType: 'WORD_SCRAMBLE',
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
        <div className="text-4xl mb-4">🔤</div>
        <div className="text-xl font-semibold text-indigo-600 animate-pulse">
          Generating Words with LLM...
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
        <p className="text-gray-600 mb-8 font-medium">
          You unscrambled {score} out of {words.length} words in {totalTime} seconds!
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

  const currentWord = words[currentIndex];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Word Scramble</h2>
            <p className="text-indigo-100">{topicName}</p>
          </div>
          <div className="flex gap-4 text-center">
            <div className="bg-black bg-opacity-20 rounded-lg p-2 min-w-20">
              <div className="text-xs font-bold text-indigo-200 uppercase tracking-wide">Word</div>
              <div className="text-xl font-bold">{currentIndex + 1}/{words.length}</div>
            </div>
            <div className="bg-black bg-opacity-20 rounded-lg p-2 min-w-20">
              <div className="text-xs font-bold text-indigo-200 uppercase tracking-wide">Time</div>
              <div className={`text-xl font-bold ${timeRemaining <= 5 ? 'text-red-300 animate-pulse' : ''}`}>
                {timeRemaining}s
              </div>
            </div>
          </div>
        </div>

        {/* Game Area */}
        <div className="p-8 md:p-12 text-center">
          
          <div className="mb-12">
            <p className="text-gray-500 font-bold tracking-widest uppercase text-sm mb-4">Hint</p>
            <p className="text-xl md:text-2xl text-gray-800 font-medium italic">
              "{currentWord.hint}"
            </p>
          </div>

          <div className="mb-12 flex flex-wrap justify-center gap-2">
            {currentWord.scrambled.split('').map((char, i) => (
              <div 
                key={i} 
                className="w-12 h-14 md:w-16 md:h-20 bg-gray-100 border-2 border-gray-300 rounded-lg flex items-center justify-center text-2xl md:text-4xl font-black text-gray-700 shadow-sm"
              >
                {char}
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
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                placeholder="Type the word..."
                className="flex-1 px-4 py-4 border-2 border-indigo-200 rounded-xl text-xl font-bold text-center focus:border-indigo-500 focus:outline-none uppercase tracking-widest shadow-inner"
                autoFocus
                disabled={submitting}
              />
              <button
                type="submit"
                disabled={!input || submitting}
                className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-bold rounded-xl transition-colors shadow-md"
              >
                Enter
              </button>
            </div>
          </form>
          
          <button 
            onClick={() => handleNextWord(false)}
            className="mt-6 text-gray-400 hover:text-gray-600 font-semibold"
          >
            Skip this word
          </button>
        </div>

      </div>
    </div>
  );
};
