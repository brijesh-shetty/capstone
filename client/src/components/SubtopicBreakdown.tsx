import React from 'react';

interface SubtopicBreakdownProps {
  breakdown: Array<{
    subtopic: string;
    total: number;
    correct: number;
    accuracy: number;
  }>;
}

export const SubtopicBreakdown: React.FC<SubtopicBreakdownProps> = ({ breakdown }) => {
  return (
    <div className="space-y-4">
      {breakdown.map((item, idx) => {
        let colorClass = 'bg-green-500';
        if (item.accuracy < 60) colorClass = 'bg-red-500';
        else if (item.accuracy < 80) colorClass = 'bg-orange-500';

        return (
          <div key={idx} className="bg-white p-4 rounded shadow border border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-gray-800">{item.subtopic}</span>
              <span className="font-bold">{item.accuracy}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className={`${colorClass} h-2.5 rounded-full`} style={{ width: `${item.accuracy}%` }}></div>
            </div>
            <div className="text-right text-xs text-gray-500 mt-1">
              {item.correct} / {item.total} correct
            </div>
          </div>
        );
      })}
    </div>
  );
};
