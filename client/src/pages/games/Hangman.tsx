import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api';

interface HangmanProps {
  topicId: string;
  topicName: string;
  onGameComplete: () => void;
}

interface Word {
  word: string;
  hint: string;
  category: string;
}

const MAX_MISTAKES = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const Hangman: React.FC<HangmanProps> = ({ topicId, topicName, onGameComplete }) => {
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [results, setResults] = useState<{ score: number; xpEarned: number } | null>(null);

  const [guessedLetters, setGuessedLetters] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [score, setScore] = useState(0); // number of words solved
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

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

  // Handle physical keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading || gameComplete || submitting) return;
      
      const key = e.key.toUpperCase();
      if (ALPHABET.includes(key)) {
        guessLetter(key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [guessedLetters, loading, gameComplete, submitting]);

  const loadGame = async () => {
    try {
      const response = await apiClient.get<any>(`/games/mini/${topicId}/HANGMAN`);
      setSessionKey(response.sessionKey);
      
      const gameWords = response.content.words.map((w: any) => ({
        ...w,
        word: w.word.toUpperCase()
      }));
      
      setWords(gameWords);
      setLoading(false);
      setTimerActive(true);
    } catch (error) {
      console.error('Failed to load hangman:', error);
      setLoading(false);
    }
  };

  const guessLetter = (letter: string) => {
    if (guessedLetters.has(letter) || mistakes >= MAX_MISTAKES) return;

    const newGuessed = new Set(guessedLetters).add(letter);
    setGuessedLetters(newGuessed);

    const currentWord = words[currentIndex].word;
    
    if (!currentWord.includes(letter)) {
      const newMistakes = mistakes + 1;
      setMistakes(newMistakes);
      
      if (newMistakes >= MAX_MISTAKES) {
        // Word failed
        setTimeout(() => handleNextWord(false), 1500);
      }
    } else {
      // Check if word is complete
      const isComplete = currentWord.split('').every(char => 
        !ALPHABET.includes(char) || newGuessed.has(char)
      );
      
      if (isComplete) {
        // Word solved
        setTimeout(() => handleNextWord(true), 1000);
      }
    }
  };

  const handleNextWord = (solved: boolean) => {
    if (solved) setScore(s => s + 1);
    
    if (currentIndex < words.length - 1) {
      setCurrentIndex(i => i + 1);
      setGuessedLetters(new Set());
      setMistakes(0);
    } else {
      submitGame(solved ? score + 1 : score);
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
        gameType: 'HANGMAN',
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

  // SVG drawing segments based on mistakes
  const renderHangman = () => {
    return (
      <svg height="250" width="200" className="mx-auto stroke-current text-gray-800" strokeWidth="4" fill="none">
        {/* Gallows */}
        <line x1="10" y1="240" x2="190" y2="240" />
        <line x1="50" y1="240" x2="50" y2="20" />
        <line x1="50" y1="20" x2="130" y2="20" />
        <line x1="130" y1="20" x2="130" y2="50" />
        
        {/* Parts */}
        {mistakes > 0 && <circle cx="130" cy="70" r="20" />} {/* Head */}
        {mistakes > 1 && <line x1="130" y1="90" x2="130" y2="150" />} {/* Body */}
        {mistakes > 2 && <line x1="130" y1="100" x2="100" y2="130" />} {/* Left Arm */}
        {mistakes > 3 && <line x1="130" y1="100" x2="160" y2="130" />} {/* Right Arm */}
        {mistakes > 4 && <line x1="130" y1="150" x2="100" y2="190" />} {/* Left Leg */}
        {mistakes > 5 && <line x1="130" y1="150" x2="160" y2="190" />} {/* Right Leg */}
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="text-4xl mb-4">💀</div>
        <div className="text-xl font-semibold text-indigo-600 animate-pulse">
          Setting up Hangman...
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
          You rescued {score} out of {words.length} concepts in {timeElapsed} seconds!
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
  const wordDisplay = currentWord.word.split('').map((char, index) => {
    if (!ALPHABET.includes(char)) return char; // spaces, hyphens
    
    const isGuessed = guessedLetters.has(char);
    const isFailed = mistakes >= MAX_MISTAKES && !isGuessed;
    
    return (
      <span 
        key={index} 
        className={`inline-block w-10 h-12 md:w-14 md:h-16 mx-1 border-b-4 text-3xl md:text-5xl font-black text-center uppercase
          ${isFailed ? 'text-red-500 border-red-200' : 'text-gray-800 border-gray-400'}`}
      >
        {isGuessed || isFailed ? char : ''}
      </span>
    );
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Hangman</h2>
            <p className="text-gray-300">{topicName} • {currentWord.category}</p>
          </div>
          <div className="flex gap-4 text-center">
            <div className="bg-black bg-opacity-30 rounded-lg p-2 min-w-20">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">Word</div>
              <div className="text-xl font-bold">{currentIndex + 1}/{words.length}</div>
            </div>
            <div className="bg-black bg-opacity-30 rounded-lg p-2 min-w-20">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">Lives</div>
              <div className={`text-xl font-bold ${MAX_MISTAKES - mistakes === 1 ? 'text-red-400 animate-pulse' : 'text-green-400'}`}>
                {MAX_MISTAKES - mistakes}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row">
          {/* Gallows Area */}
          <div className="w-full md:w-1/3 bg-gray-50 p-6 flex items-center justify-center border-r border-gray-100">
            {renderHangman()}
          </div>

          {/* Game Area */}
          <div className="w-full md:w-2/3 p-6 md:p-10 flex flex-col justify-between">
            
            <div className="mb-8">
              <p className="text-gray-500 font-bold tracking-widest uppercase text-sm mb-2">Hint</p>
              <p className="text-lg text-gray-800 font-medium italic border-l-4 border-indigo-500 pl-4">
                "{currentWord.hint}"
              </p>
            </div>

            <div className="mb-12 text-center">
              {wordDisplay}
            </div>

            {/* Keyboard */}
            <div className="grid grid-cols-7 gap-2">
              {ALPHABET.map(letter => {
                const isGuessed = guessedLetters.has(letter);
                const isCorrect = currentWord.word.includes(letter);
                
                let btnClass = "py-3 rounded-lg font-bold text-lg transition-colors border-2 shadow-sm ";
                if (!isGuessed) {
                  btnClass += "bg-white border-gray-200 text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 active:bg-indigo-100 cursor-pointer";
                } else if (isCorrect) {
                  btnClass += "bg-green-100 border-green-500 text-green-700 opacity-50 cursor-not-allowed";
                } else {
                  btnClass += "bg-gray-100 border-gray-300 text-gray-400 opacity-50 cursor-not-allowed";
                }

                return (
                  <button
                    key={letter}
                    onClick={() => guessLetter(letter)}
                    disabled={isGuessed || mistakes >= MAX_MISTAKES}
                    className={btnClass}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
};
