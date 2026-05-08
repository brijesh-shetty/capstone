import React from 'react';

interface WeakTopicCardProps {
  subtopic: string;
  accuracy: number;
}

export const WeakTopicCard: React.FC<WeakTopicCardProps> = ({ subtopic, accuracy }) => {
  return (
    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded shadow flex justify-between items-center">
      <div>
        <h4 className="font-bold text-red-900">{subtopic}</h4>
        <p className="text-sm text-red-700 mt-1">Accuracy: {accuracy}% - High Priority</p>
      </div>
      <button 
        className="px-4 py-2 bg-red-100 text-red-800 font-bold rounded border border-red-200 hover:bg-red-200 transition"
        onClick={() => {
          // This would ideally navigate to the study plan or start practice
          window.location.hash = 'study-plan'; // Simplistic fallback
        }}
      >
        Review Now
      </button>
    </div>
  );
};
