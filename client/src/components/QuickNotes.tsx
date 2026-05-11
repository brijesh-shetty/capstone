import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

export interface QuickNotesData {
  keyPoints: string[];
  funFact: string;
  gameTypeHint: string;
}

interface QuickNotesProps {
  topicId: string;
  topicName: string;
  gameType: string;
  onReady: () => void;
  onSkip: () => void;
}

export const QuickNotes: React.FC<QuickNotesProps> = ({ topicId, topicName, gameType, onReady, onSkip }) => {
  const [notes, setNotes] = useState<QuickNotesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const response = await apiClient.get<QuickNotesData>(`/domains/quick-notes/${topicId}/${gameType}`);
        setNotes(response);
      } catch (err) {
        console.error('Failed to load quick notes:', err);
        setError('Failed to load pre-game notes.');
        // If it fails, we shouldn't block the user from playing
      } finally {
        setLoading(false);
      }
    };
    fetchNotes();
  }, [topicId, gameType]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900 bg-opacity-75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-black mb-1">Before you play...</h2>
              <p className="text-indigo-100 font-medium">{topicName}</p>
            </div>
            <div className="text-4xl animate-bounce">🧠</div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto grow">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="text-5xl animate-spin">🤔</div>
              <p className="text-gray-500 font-semibold animate-pulse">Preparing your notes...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-500 font-bold mb-4">{error}</p>
              <button 
                onClick={onReady}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
              >
                Play Anyway
              </button>
            </div>
          ) : notes ? (
            <div className="space-y-6">
              
              {/* Key Points */}
              <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                <h3 className="font-bold text-indigo-900 mb-3 flex items-center text-lg">
                  <span className="mr-2">💡</span> Key Concepts
                </h3>
                <ul className="space-y-3">
                  {notes.keyPoints.map((point, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-indigo-500 mr-2 font-bold">•</span>
                      <span className="text-gray-700 leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Game Hint */}
              <div className="bg-blue-50 p-5 rounded-xl border border-blue-100">
                <h3 className="font-bold text-blue-900 mb-2 flex items-center">
                  <span className="mr-2">🎯</span> {gameType.replace('_', ' ')} Hint
                </h3>
                <p className="text-gray-700 italic">"{notes.gameTypeHint}"</p>
              </div>

              {/* Fun Fact */}
              <div className="bg-yellow-50 p-5 rounded-xl border border-yellow-200">
                <h3 className="font-bold text-yellow-800 mb-2 flex items-center">
                  <span className="mr-2">✨</span> Fun Fact
                </h3>
                <p className="text-gray-700">{notes.funFact}</p>
              </div>

            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end space-x-3 shrink-0">
          <button 
            onClick={onSkip}
            className="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-200 rounded-lg transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            onClick={onReady}
            disabled={loading && !error}
            className={`px-6 py-2.5 rounded-lg font-black text-white shadow-md transition-all ${
              loading && !error 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-green-500 hover:bg-green-600 hover:-translate-y-0.5 hover:shadow-lg'
            }`}
          >
            I'm Ready! 🚀
          </button>
        </div>
      </div>
    </div>
  );
};
