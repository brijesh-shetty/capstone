import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api';

interface TheoryData {
  formulas: string[];
}

interface Props {
  topicId: string;
  topicName: string;
  onComplete: () => void;
}

interface MatchItem {
  id: number;
  text: string;
  isFormula: boolean;
  pairId: number;
  isMatched: boolean;
}

export const FormulaMatch: React.FC<Props> = ({ topicId, topicName, onComplete }) => {
  const [leftCol, setLeftCol] = useState<MatchItem[]>([]);
  const [rightCol, setRightCol] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [selectedRight, setSelectedRight] = useState<number | null>(null);
  
  const [matches, setMatches] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [completed, setCompleted] = useState(false);
  
  const [score, setScore] = useState(0);

  useEffect(() => {
    const fetchTheory = async () => {
      try {
        const data = await apiClient.get<TheoryData>(`/interview/topics/${topicId}/theory`);
        
        const validFormulas = (data.formulas || []).filter(f => f.includes('='));
        if (validFormulas.length === 0) {
          setError('Not enough formulas to play Match game.');
          setLoading(false);
          return;
        }

        const left: MatchItem[] = [];
        const right: MatchItem[] = [];

        validFormulas.forEach((f, i) => {
          const parts = f.split('=');
          left.push({ id: i * 2, text: `Formula for ${parts[0].trim()}`, isFormula: false, pairId: i, isMatched: false });
          right.push({ id: i * 2 + 1, text: parts.slice(1).join('=').trim(), isFormula: true, pairId: i, isMatched: false });
        });

        setLeftCol(left.sort(() => Math.random() - 0.5));
        setRightCol(right.sort(() => Math.random() - 0.5));

      } catch (e) {
        setError('Failed to load formulas.');
      } finally {
        setLoading(false);
      }
    };
    fetchTheory();
  }, [topicId]);

  const handleLeftClick = (id: number) => {
    if (leftCol.find(x => x.id === id)?.isMatched) return;
    setSelectedLeft(id);
    checkMatch(id, selectedRight);
  };

  const handleRightClick = (id: number) => {
    if (rightCol.find(x => x.id === id)?.isMatched) return;
    setSelectedRight(id);
    checkMatch(selectedLeft, id);
  };

  const checkMatch = (lId: number | null, rId: number | null) => {
    if (lId === null || rId === null) return;

    const leftItem = leftCol.find(x => x.id === lId);
    const rightItem = rightCol.find(x => x.id === rId);

    if (leftItem && rightItem && leftItem.pairId === rightItem.pairId) {
      // Match
      setLeftCol(prev => prev.map(x => x.id === lId ? { ...x, isMatched: true } : x));
      setRightCol(prev => prev.map(x => x.id === rId ? { ...x, isMatched: true } : x));
      setMatches(prev => {
        const newMatches = prev + 1;
        if (newMatches === leftCol.length) {
          setCompleted(true);
        }
        return newMatches;
      });
      setScore(prev => prev + 10);
    } else {
      // Mismatch
      setMistakes(prev => prev + 1);
      setScore(prev => Math.max(0, prev - 2));
    }
    
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  if (loading) return <div className="text-center p-12 text-xl font-bold">Loading...</div>;
  if (error) return <div className="text-center p-12 text-red-500">{error}<br/><button onClick={onComplete} className="text-indigo-600 underline mt-4">Go Back</button></div>;

  if (completed) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl text-center">
        <h2 className="text-4xl font-black text-gray-900 mb-6">🎉 Fully Matched!</h2>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-indigo-50 p-4 rounded-xl">
            <p className="text-sm font-bold text-indigo-500 uppercase">Score</p>
            <p className="text-3xl font-black text-indigo-700">{score}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-xl">
            <p className="text-sm font-bold text-red-500 uppercase">Mistakes</p>
            <p className="text-3xl font-black text-red-700">{mistakes}</p>
          </div>
        </div>
        <button
          onClick={onComplete}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-xl shadow-md"
        >
          Back to Games
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Formula Match: {topicName}</h2>
          <p className="text-gray-500 text-sm mt-1">Connect the concept with its formula.</p>
        </div>
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-xs font-bold text-gray-400 uppercase">Score</div>
            <div className="text-xl font-bold text-indigo-600">{score}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="space-y-4">
          {leftCol.map(item => (
            <button
              key={item.id}
              onClick={() => handleLeftClick(item.id)}
              disabled={item.isMatched}
              className={`w-full p-4 rounded-xl text-left font-bold transition-all border-2
                ${item.isMatched ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-50' : 
                  selectedLeft === item.id ? 'bg-indigo-100 border-indigo-500 text-indigo-900 shadow-md transform scale-105' : 
                  'bg-white border-indigo-100 text-indigo-700 hover:border-indigo-300 shadow-sm'}
              `}
            >
              {item.text}
            </button>
          ))}
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {rightCol.map(item => (
            <button
              key={item.id}
              onClick={() => handleRightClick(item.id)}
              disabled={item.isMatched}
              className={`w-full p-4 rounded-xl text-center font-bold text-xl transition-all border-2
                ${item.isMatched ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-50' : 
                  selectedRight === item.id ? 'bg-emerald-100 border-emerald-500 text-emerald-900 shadow-md transform scale-105' : 
                  'bg-white border-emerald-100 text-emerald-700 hover:border-emerald-300 shadow-sm'}
              `}
            >
              = {item.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
