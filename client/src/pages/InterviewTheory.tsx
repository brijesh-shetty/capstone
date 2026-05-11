import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface TheoryData {
  id: string;
  topicId: string;
  rawTheory: string;
  keyPoints: string[];
  formulas: string[];
  tutorialSections: { heading: string; content: string | string[] }[];
}

interface Props {
  topicId: string;
  onReadyToPractice: () => void;
  onBack: () => void;
}

export const InterviewTheory: React.FC<Props> = ({ topicId, onReadyToPractice, onBack }) => {
  const [theory, setTheory] = useState<TheoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTheory = async () => {
      try {
        const data = await apiClient.get<TheoryData>(`/interview/topics/${topicId}/theory`);
        setTheory(data);
      } catch (e: any) {
        setError('Theory notes are not available for this topic yet.');
      } finally {
        setLoading(false);
      }
    };
    fetchTheory();
  }, [topicId]);

  const handleRefreshNotes = async () => {
    setCleaning(true);
    try {
      const data = await apiClient.post<any>('/interview/admin/cleanup-theory', { topicId });
      // Update local state with cleaned data
      setTheory(prev => prev ? {
        ...prev,
        keyPoints: data.keyPoints,
        formulas: data.formulas,
        tutorialSections: data.tutorialSections
      } : null);
    } catch (e: any) {
      alert('Failed to clean up notes: ' + (e.error || e.message));
    } finally {
      setCleaning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !theory) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg inline-block mb-4">
          {error || 'Theory not found'}
        </div>
        <div>
          <button onClick={onBack} className="text-indigo-600 font-bold hover:underline">
            ← Back to Topics
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <button onClick={onBack} className="mr-4 text-gray-500 hover:text-gray-800 transition">
            <span className="text-2xl">←</span>
          </button>
          <h2 className="text-3xl font-bold text-gray-800">Study Notes</h2>
        </div>
        <button 
          onClick={handleRefreshNotes} 
          disabled={cleaning}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-semibold hover:bg-indigo-100 transition disabled:opacity-50"
        >
          {cleaning ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
              <span>Cleaning...</span>
            </>
          ) : (
            <>
              <span>✨</span>
              <span>Refresh Notes (AI)</span>
            </>
          )}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 mb-8">
        {/* Key Points */}
        {theory.keyPoints && theory.keyPoints.length > 0 && (
          <div className="mb-8">
            <h3 className="text-2xl font-bold text-indigo-700 mb-4 border-b pb-2">Key Points</h3>
            <ul className="list-disc pl-5 space-y-2 text-gray-700">
              {theory.keyPoints.map((point, idx) => (
                <li key={idx}>{point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Formulas */}
        {theory.formulas && theory.formulas.length > 0 && (
          <div className="mb-8">
            <h3 className="text-2xl font-bold text-emerald-700 mb-4 border-b pb-2">Important Formulas</h3>
            <div className="bg-emerald-50 rounded-lg p-6 border border-emerald-100">
              <ul className="list-disc pl-5 space-y-3 text-emerald-900 font-medium">
                {theory.formulas.map((formula, idx) => (
                  <li key={idx}>{formula}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Tutorial Sections */}
        {theory.tutorialSections && theory.tutorialSections.map((section, idx) => (
          <div key={idx} className="mb-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">{section.heading}</h3>
            {Array.isArray(section.content) ? (
              <ul className="list-disc pl-5 space-y-2 text-gray-700">
                {section.content.map((item, itemIdx) => (
                  <li key={itemIdx}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-700 whitespace-pre-wrap">{section.content}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onReadyToPractice}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xl py-4 px-12 rounded-full shadow-lg transition transform hover:-translate-y-1"
        >
          🎮 Ready to Practice!
        </button>
      </div>
    </div>
  );
};
