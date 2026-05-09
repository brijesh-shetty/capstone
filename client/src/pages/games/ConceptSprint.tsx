import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api';

interface TheoryData {
  keyPoints: string[];
  formulas: string[];
}

interface Props {
  topicId: string;
  topicName: string;
  onComplete: () => void;
}

interface Question {
  id: number;
  text: string;
  type: 'TF' | 'FILL';
  correctAnswer: string | boolean;
  options?: string[];
}

export const ConceptSprint: React.FC<Props> = ({ topicId, topicName, onComplete }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(15);
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    const fetchTheory = async () => {
      try {
        const data = await apiClient.get<TheoryData>(`/interview/topics/${topicId}/theory`);
        
        const qs: Question[] = [];
        let idCounter = 0;

        // Generate T/F from key points
        data.keyPoints?.forEach(kp => {
          if (kp.length > 20) {
            // True statement
            qs.push({ id: idCounter++, text: kp, type: 'TF', correctAnswer: true });
            
            // Generate a fake false statement (very naive approach for demonstration)
            if (kp.includes('is a')) {
              qs.push({ id: idCounter++, text: kp.replace('is a', 'is NOT a'), type: 'TF', correctAnswer: false });
            } else if (kp.includes('always')) {
              qs.push({ id: idCounter++, text: kp.replace('always', 'never'), type: 'TF', correctAnswer: false });
            }
          }
        });

        // Generate Fill from formulas
        data.formulas?.forEach(f => {
          const parts = f.split('=');
          if (parts.length >= 2) {
            const left = parts[0].trim();
            const right = parts.slice(1).join('=').trim();
            
            qs.push({
              id: idCounter++,
              text: `The formula for ${left} is ___`,
              type: 'FILL',
              correctAnswer: right,
              options: [right, right.replace('+', '-'), right.replace('2', '3'), right + ' / 2'].sort(() => Math.random() - 0.5)
            });
          }
        });

        if (qs.length === 0) {
          setError('Not enough data to generate Concept Sprint.');
          return;
        }

        // Shuffle and take max 10
        const shuffled = qs.sort(() => Math.random() - 0.5).slice(0, 10);
        setQuestions(shuffled);
        setTimerActive(true);
      } catch (e) {
        setError('Failed to load study notes.');
      } finally {
        setLoading(false);
      }
    };
    fetchTheory();
  }, [topicId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && !completed) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleAnswer(null); // time out
            return 15;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, completed, currentIndex]);

  const handleAnswer = (answer: string | boolean | null) => {
    const q = questions[currentIndex];
    if (answer !== null && answer === q.correctAnswer) {
      setScore(prev => prev + 10 + timeRemaining); // bonus for speed
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setTimeRemaining(15);
    } else {
      setCompleted(true);
      setTimerActive(false);
    }
  };

  if (loading) return <div className="text-center p-12 text-xl font-bold">Loading...</div>;
  if (error || questions.length === 0) return <div className="text-center p-12 text-red-500">{error}<br/><button onClick={onComplete} className="text-indigo-600 underline mt-4">Go Back</button></div>;

  if (completed) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl text-center">
        <h2 className="text-4xl font-black text-gray-900 mb-6">🎉 Sprint Complete!</h2>
        <div className="bg-amber-50 p-6 rounded-xl border border-amber-200 mb-8 inline-block">
          <p className="text-sm font-bold text-amber-600 uppercase">Final Score</p>
          <p className="text-5xl font-black text-amber-700">{score}</p>
        </div>
        <button
          onClick={onComplete}
          className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white text-lg font-bold rounded-xl shadow-md transition"
        >
          Back to Games
        </button>
      </div>
    );
  }

  const q = questions[currentIndex];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Concept Sprint</h2>
          <p className="text-gray-500 text-sm mt-1">{topicName} - Question {currentIndex + 1} of {questions.length}</p>
        </div>
        <div className="flex gap-4">
          <div className="text-center">
            <div className="text-xs font-bold text-gray-400 uppercase">Score</div>
            <div className="text-xl font-bold text-amber-600">{score}</div>
          </div>
          <div className="text-center">
            <div className="text-xs font-bold text-gray-400 uppercase">Time</div>
            <div className={`text-xl font-bold ${timeRemaining <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-700'}`}>
              {timeRemaining}s
            </div>
          </div>
        </div>
      </div>

      <div className="w-full bg-gray-200 h-2 rounded-full mb-8 overflow-hidden">
        <div className="bg-amber-400 h-2 transition-all duration-1000 ease-linear" style={{ width: `${(timeRemaining / 15) * 100}%` }}></div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center min-h-[300px] flex flex-col justify-center">
        <h3 className="text-2xl font-medium text-gray-800 mb-12 leading-relaxed">
          {q.text}
        </h3>

        {q.type === 'TF' ? (
          <div className="grid grid-cols-2 gap-4 mt-auto">
            <button onClick={() => handleAnswer(true)} className="py-4 bg-green-100 text-green-700 font-bold rounded-xl hover:bg-green-200 border-2 border-green-200 hover:border-green-400 transition text-xl">TRUE</button>
            <button onClick={() => handleAnswer(false)} className="py-4 bg-red-100 text-red-700 font-bold rounded-xl hover:bg-red-200 border-2 border-red-200 hover:border-red-400 transition text-xl">FALSE</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 mt-auto">
            {q.options?.map((opt, i) => (
              <button key={i} onClick={() => handleAnswer(opt)} className="py-3 px-4 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 border-2 border-indigo-100 hover:border-indigo-300 transition text-lg">{opt}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
