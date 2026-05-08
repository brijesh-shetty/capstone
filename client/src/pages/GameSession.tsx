import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface Question {
  hash: string;
  questionText: string;
  options: string[];
}

interface GameSessionProps {
  topicId: string;
  topicName: string;
  onGameComplete: () => void;
  preloadedSessionData?: {
    sessionKey: string;
    topicId: string;
    topicName: string;
    questions: Question[];
  } | null;
}

interface Answer {
  hash: string;
  chosenAnswer: string;
  timeTakenMs: number;
  hintUsed: boolean;
}

interface GameResult {
  hash: string;
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
}

export const GameSession: React.FC<GameSessionProps> = ({ topicId, topicName, onGameComplete, preloadedSessionData }) => {
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  
  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  const [timeLeft, setTimeLeft] = useState(30);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  
  const [score, setScore] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [results, setResults] = useState<GameResult[]>([]);

  // Load game session on mount
  useEffect(() => {
    if (preloadedSessionData) {
      setSessionKey(preloadedSessionData.sessionKey);
      setQuestions(preloadedSessionData.questions);
      setLoading(false);
    } else {
      loadGameSession();
    }
  }, [topicId, preloadedSessionData]);

  // Timer for each question
  useEffect(() => {
    if (gameComplete || !sessionKey) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleTimeUp();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionKey, gameComplete]);

  const loadGameSession = async () => {
    try {
      const response = await apiClient.get<any>(
        `/games/session/${topicId}`
      );
      setSessionKey(response.sessionKey);
      setQuestions(response.questions);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load game session:', error);
      setLoading(false);
    }
  };

  const handleTimeUp = () => {
    if (selectedAnswer === null) {
      handleAnswer(null);
    }
  };

  const fetchHint = async () => {
    if (!sessionKey || hintLoading || hint) return;
    setHintLoading(true);
    try {
      const response = await apiClient.post<any>('/games/hint', {
        sessionKey,
        questionHash: questions[currentQuestionIndex].hash
      });
      setHint(response.hint);
    } catch (error) {
      console.error('Failed to get hint:', error);
      setHint('Failed to load hint.');
    } finally {
      setHintLoading(false);
    }
  };

  const handleAnswer = async (answer: string | null) => {
    const timeTaken = Date.now() - sessionStartTime;
    const currentQuestion = questions[currentQuestionIndex];

    const newAnswers = [
      ...answers,
      {
        hash: currentQuestion.hash,
        chosenAnswer: answer || 'skipped',
        timeTakenMs: timeTaken,
        hintUsed: !!hint
      }
    ];
    setAnswers(newAnswers);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setHint(null);
      setTimeLeft(30);
      setSessionStartTime(Date.now());
    } else {
      // Submit game
      await submitGame(newAnswers);
    }
  };

  const submitGame = async (finalAnswers: Answer[]) => {
    setSubmitting(true);
    try {
      const response = await apiClient.post<any>('/games/session/submit', {
        sessionKey,
        topicId,
        answers: finalAnswers,
        durationSec: Math.floor((Date.now() - sessionStartTime) / 1000)
      });

      setScore(response.score);
      setXpEarned(response.xpEarned);
      setResults(response.results);
      setGameComplete(true);
    } catch (error) {
      console.error('Failed to submit game:', error);
      alert('Failed to submit game. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading game... Generating questions with Claude...</div>;
  }

  if (questions.length === 0) {
    return <div className="text-center py-8">No questions available</div>;
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl mx-auto">
      {gameComplete ? (
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-4">🎉 Game Complete!</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded">
              <p className="text-gray-600">Score</p>
              <p className="text-3xl font-bold text-blue-600">{score}%</p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="text-gray-600">XP Earned</p>
              <p className="text-3xl font-bold text-green-600">+{xpEarned}</p>
            </div>
          </div>
          
          <div className="mt-8 text-left max-h-96 overflow-y-auto pr-4">
            <h3 className="text-xl font-bold mb-4">Review Your Answers</h3>
            {results.map((res, idx) => {
              const q = questions.find(q => q.hash === res.hash);
              const userAns = answers.find(a => a.hash === res.hash)?.chosenAnswer;
              
              return (
                <div key={idx} className={`p-4 mb-4 rounded border-l-4 ${res.isCorrect ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
                  <p className="font-bold mb-2">{q?.questionText}</p>
                  <p className="text-sm mb-1">
                    <span className="font-semibold">Your Answer: </span>
                    <span className={res.isCorrect ? 'text-green-700' : 'text-red-700'}>{userAns}</span>
                  </p>
                  {!res.isCorrect && (
                    <p className="text-sm mb-2 text-green-700">
                      <span className="font-semibold">Correct Answer: </span>
                      {res.correctAnswer}
                    </p>
                  )}
                  <p className="text-sm italic mt-2">{res.explanation}</p>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => {
              setGameComplete(false);
              onGameComplete();
            }}
            className="mt-6 px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 font-bold"
          >
            Back to Dashboard
          </button>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">{topicName}</h2>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>
              <span className={`text-sm font-bold ${timeLeft <= 10 ? 'text-red-600' : 'text-blue-600'}`}>
                ⏱️ {timeLeft}s
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold mb-4">{currentQuestion.questionText}</h3>

            <div className="space-y-2 mb-6">
              {currentQuestion.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedAnswer(option)}
                  disabled={submitting}
                  className={`w-full p-4 text-left rounded border-2 transition ${
                    selectedAnswer === option
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-300'
                  }`}
                >
                  <span className="font-semibold mr-3">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 flex flex-col items-center">
            {hint ? (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-lg w-full mb-4">
                <span className="font-bold mr-2">💡 Hint:</span>
                {hint}
              </div>
            ) : (
              <button
                onClick={fetchHint}
                disabled={hintLoading || submitting}
                className="text-yellow-600 hover:text-yellow-700 font-semibold flex items-center gap-2 mb-4 disabled:opacity-50"
              >
                {hintLoading ? 'Generating hint...' : '💡 Need a hint?'}
              </button>
            )}
          </div>

          {selectedAnswer && (
            <button
              onClick={() => handleAnswer(selectedAnswer)}
              disabled={submitting}
              className="w-full px-6 py-3 bg-green-500 text-white rounded hover:bg-green-600 font-bold disabled:bg-gray-400"
            >
              {submitting ? 'Submitting...' : 'Submit Answer'}
            </button>
          )}

          {!selectedAnswer && (
            <button
              onClick={() => handleAnswer(null)}
              disabled={submitting}
              className="w-full px-6 py-3 bg-gray-400 text-white rounded hover:bg-gray-500 font-bold disabled:bg-gray-300"
            >
              Skip Question
            </button>
          )}
        </>
      )}
    </div>
  );
};
