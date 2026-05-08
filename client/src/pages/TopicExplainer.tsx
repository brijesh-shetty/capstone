import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface TopicExplainerProps {
  topicId: string;
  topicName: string;
  onClose: () => void;
  onStartPractice: (sessionKey: string) => void;
}

export const TopicExplainer: React.FC<TopicExplainerProps> = ({ topicId, topicName, onClose, onStartPractice }) => {
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<any>(null);

  useEffect(() => {
    let eventSource: EventSource;

    const fetchExplanation = () => {
      const token = localStorage.getItem('token');
      
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/study-plan/${topicId}/explain`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }).then(async (response) => {
        if (!response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let done = false;

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          const chunkValue = decoder.decode(value);
          const lines = chunkValue.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') {
                setLoading(false);
                fetchPracticeProblems();
                return;
              }
              try {
                const data = JSON.parse(dataStr);
                if (data.text) {
                  setExplanation((prev) => prev + data.text);
                }
              } catch (e) {
                // Ignore parse errors on incomplete chunks
              }
            }
          }
        }
      }).catch(err => {
        console.error('Stream error:', err);
        setExplanation('Failed to load explanation. Please try again.');
        setLoading(false);
      });
    };

    fetchExplanation();

    return () => {
      // Cleanup if needed
    };
  }, [topicId]);

  const fetchPracticeProblems = async () => {
    try {
      const res = await apiClient.get<any>(`/study-plan/${topicId}/problems`);
      setSessionData(res);
    } catch (err) {
      console.error('Failed to prepare practice problems', err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-indigo-700">Understanding: {topicName}</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✖</button>
      </div>

      <div className="prose max-w-none bg-blue-50 p-6 rounded-lg mb-8">
        {explanation ? (
          <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
            {explanation}
          </div>
        ) : (
          <p className="text-gray-500 italic">Thinking...</p>
        )}
        
        {loading && (
          <div className="flex items-center mt-4 text-blue-600">
            <span className="animate-pulse mr-2">●</span>
            <span className="animate-pulse mr-2 animation-delay-200">●</span>
            <span className="animate-pulse animation-delay-400">●</span>
          </div>
        )}
      </div>

      {!loading && (
        <div className="text-center border-t pt-6">
          <h3 className="text-xl font-bold mb-4">Ready to test your knowledge?</h3>
          {sessionData ? (
            <button
              onClick={() => onStartPractice(sessionData)}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-8 rounded-lg shadow transition transform hover:scale-105"
            >
              Start Remedial Practice
            </button>
          ) : (
            <p className="text-gray-500">Preparing practice problems...</p>
          )}
        </div>
      )}
    </div>
  );
};
