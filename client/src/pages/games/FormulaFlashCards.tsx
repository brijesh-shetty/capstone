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

export const FormulaFlashCards: React.FC<Props> = ({ topicId, topicName, onComplete }) => {
  const [cards, setCards] = useState<{ front: string; back: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const fetchTheory = async () => {
      try {
        const data = await apiClient.get<TheoryData>(`/interview/topics/${topicId}/theory`);
        
        const flashcards = [];
        
        // Convert formulas to flashcards
        // Attempt to split by '=' or just show 'Formula' as front
        data.formulas?.forEach((f, i) => {
          const parts = f.split('=');
          if (parts.length >= 2) {
            flashcards.push({ front: `Formula for ${parts[0].trim()}`, back: f });
          } else {
            flashcards.push({ front: `Formula ${i + 1}`, back: f });
          }
        });

        // Add some key points as flashcards
        data.keyPoints?.slice(0, 5).forEach((p, i) => {
          flashcards.push({ front: `Key Concept ${i + 1}`, back: p });
        });

        // Shuffle
        setCards(flashcards.sort(() => Math.random() - 0.5));
      } catch (e) {
        setError('Failed to load study notes for flashcards.');
      } finally {
        setLoading(false);
      }
    };
    fetchTheory();
  }, [topicId]);

  const handleRate = (rating: 'easy' | 'hard' | 'again') => {
    if (rating === 'easy') {
      setScore(prev => prev + 10);
    }
    
    // Move to next card, or if 'again', put it at the back
    if (rating === 'again' || rating === 'hard') {
      setCards(prev => {
        const newCards = [...prev];
        const current = newCards.splice(currentIndex, 1)[0];
        // insert somewhere near the end
        newCards.splice(Math.min(currentIndex + 3, newCards.length), 0, current);
        return newCards;
      });
      // currentIndex stays the same because the next card shifted into this slot
    } else {
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        setCompleted(true);
      }
    }
    setIsFlipped(false);
  };

  if (loading) return <div className="text-center p-12 text-xl font-bold">Loading Flashcards...</div>;
  if (error || cards.length === 0) return <div className="text-center p-12 text-red-500">{error || 'No flashcards generated.'}<br/><button onClick={onComplete} className="text-indigo-600 underline mt-4">Go Back</button></div>;

  if (completed) {
    return (
      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl text-center">
        <h2 className="text-4xl font-black text-gray-900 mb-6">🎉 Deck Completed!</h2>
        <p className="text-xl mb-8 text-gray-600">Great job reviewing {topicName}!</p>
        <button
          onClick={onComplete}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold rounded-xl shadow-md"
        >
          Back to Games
        </button>
      </div>
    );
  }

  const card = cards[currentIndex];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Flashcards: {topicName}</h2>
        <p className="text-gray-500 font-bold mt-2">Card {currentIndex + 1} of {cards.length}</p>
      </div>

      <div 
        className="w-full h-80 cursor-pointer relative"
        style={{ perspective: '1000px' }}
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div 
          className="w-full h-full absolute transition-transform duration-500 shadow-xl rounded-2xl"
          style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Front */}
          <div 
            className="w-full h-full absolute bg-indigo-50 border-2 border-indigo-200 rounded-2xl flex items-center justify-center p-8 text-center"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div>
              <p className="text-sm font-bold text-indigo-400 uppercase tracking-widest mb-4">Question / Term</p>
              <h3 className="text-3xl font-bold text-indigo-900">{card.front}</h3>
            </div>
          </div>

          {/* Back */}
          <div 
            className="w-full h-full absolute bg-emerald-50 border-2 border-emerald-200 rounded-2xl flex items-center justify-center p-8 text-center"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div>
              <p className="text-sm font-bold text-emerald-500 uppercase tracking-widest mb-4">Answer / Formula</p>
              <p className="text-2xl font-medium text-emerald-900 leading-relaxed">{card.back}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center h-20">
        {!isFlipped ? (
          <p className="text-gray-500 font-bold animate-pulse">Click card to flip</p>
        ) : (
          <div className="flex gap-4 justify-center">
            <button onClick={(e) => { e.stopPropagation(); handleRate('again'); }} className="px-6 py-3 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200">Again</button>
            <button onClick={(e) => { e.stopPropagation(); handleRate('hard'); }} className="px-6 py-3 bg-orange-100 text-orange-700 font-bold rounded-lg hover:bg-orange-200">Hard</button>
            <button onClick={(e) => { e.stopPropagation(); handleRate('easy'); }} className="px-6 py-3 bg-green-100 text-green-700 font-bold rounded-lg hover:bg-green-200">Easy</button>
          </div>
        )}
      </div>
    </div>
  );
};
