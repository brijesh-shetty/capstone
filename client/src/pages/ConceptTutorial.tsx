import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface TutorialData {
  title: string;
  introduction: string;
  keyConcepts: { term: string; explanation: string }[];
  examples: { description: string; code?: string }[];
  summary: string;
  readyMessage: string;
}

interface ConceptTutorialProps {
  topicId: string;
  onReadyToPlay: () => void;
  onBack: () => void;
}

export const ConceptTutorial: React.FC<ConceptTutorialProps> = ({ topicId, onReadyToPlay, onBack }) => {
  const [data, setData] = useState<TutorialData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTutorial = async () => {
      try {
        const response = await apiClient.get<TutorialData>(`/domains/tutorial/${topicId}`);
        setData(response);
      } catch (error) {
        console.error('Failed to load tutorial', error);
      } finally {
        setLoading(false);
      }
    };
    fetchTutorial();
  }, [topicId]);

  if (loading || !data) {
    return (
      <div className="flex flex-col justify-center items-center h-screen max-w-3xl mx-auto text-center px-4">
        <div className="text-6xl mb-6 animate-bounce">🤖</div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">AI is writing your lesson...</h2>
        <p className="text-gray-500">Generating structured concepts and examples.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-32">
      <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-semibold mb-6 flex items-center">
        <span className="mr-2">&larr;</span> Back to Journey
      </button>

      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-indigo-600 p-8 text-white">
          <div className="inline-block px-3 py-1 bg-indigo-500 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
            Concept Tutorial
          </div>
          <h1 className="text-4xl font-extrabold mb-4">{data.title}</h1>
          <p className="text-indigo-100 text-lg leading-relaxed">{data.introduction}</p>
        </div>

        <div className="p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <span className="text-indigo-500 mr-2">🔑</span> Key Concepts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {data.keyConcepts.map((c, i) => (
              <div key={i} className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
                <h3 className="font-bold text-indigo-900 mb-2">{c.term}</h3>
                <p className="text-gray-700 leading-relaxed text-sm">{c.explanation}</p>
              </div>
            ))}
          </div>

          {data.examples && data.examples.length > 0 && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                <span className="text-indigo-500 mr-2">💡</span> Examples
              </h2>
              <div className="space-y-6 mb-10">
                {data.examples.map((ex, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <p className="font-semibold text-gray-800 mb-3">{ex.description}</p>
                    {ex.code && (
                      <pre className="bg-gray-800 text-green-400 p-4 rounded-lg overflow-x-auto font-mono text-sm shadow-inner">
                        <code>{ex.code}</code>
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-r-xl mb-12">
            <h3 className="font-bold text-yellow-800 mb-2">Summary</h3>
            <p className="text-yellow-900">{data.summary}</p>
          </div>

          <div className="text-center">
            <p className="text-gray-500 italic mb-6">{data.readyMessage}</p>
            <button
              onClick={onReadyToPlay}
              className="bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-white font-black text-xl py-4 px-12 rounded-full shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all"
            >
              🎮 I'm Ready, Let's Play!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
