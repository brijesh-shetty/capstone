import React, { useState } from 'react';
import { TestTimer } from '../components/TestTimer';

interface TestExecutionProps {
  questions: any[];
  config: any;
  onSubmit: (answers: Record<string, string>) => void;
}

export const TestExecution: React.FC<TestExecutionProps> = ({ questions, config, onSubmit }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());

  const currentQ = questions[currentIndex];

  const toggleFlag = () => {
    setFlagged(prev => {
      const newSet = new Set(prev);
      if (newSet.has(currentIndex)) newSet.delete(currentIndex);
      else newSet.add(currentIndex);
      return newSet;
    });
  };

  const handleTimeUp = () => {
    onSubmit(answers);
  };

  const handleSubmit = () => {
    const unanswered = questions.length - Object.keys(answers).length;
    if (unanswered > 0) {
      if (!window.confirm(`You have ${unanswered} unanswered questions. Are you sure you want to submit?`)) {
        return;
      }
    }
    onSubmit(answers);
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6">
      <div className="md:w-3/4 bg-white p-8 rounded-lg shadow-lg flex flex-col min-h-[600px]">
        <div className="flex justify-between items-center mb-6 pb-4 border-b">
          <h2 className="text-xl font-bold">Question {currentIndex + 1} of {questions.length}</h2>
          <TestTimer initialMinutes={config.timeLimitMin} onTimeUp={handleTimeUp} />
        </div>

        <div className="flex-grow">
          <div className="mb-8">
            <span className="text-xs font-bold bg-indigo-100 text-indigo-800 px-3 py-1 rounded uppercase tracking-wide">
              {currentQ.subtopic}
            </span>
            <p className="text-xl font-medium mt-4 leading-relaxed">{currentQ.questionText}</p>
          </div>

          <div className="space-y-4">
            {currentQ.options.map((opt: string, oIdx: number) => {
              const isSelected = answers[currentQ.hash] === opt;
              return (
                <label 
                  key={oIdx} 
                  className={`block p-4 rounded-lg border-2 cursor-pointer transition ${
                    isSelected 
                      ? 'bg-indigo-50 border-indigo-500' 
                      : 'border-gray-200 hover:bg-gray-50 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-center">
                    <input
                      type="radio"
                      name={`q-${currentQ.hash}`}
                      value={opt}
                      checked={isSelected}
                      onChange={() => setAnswers(prev => ({ ...prev, [currentQ.hash]: opt }))}
                      className="w-5 h-5 text-indigo-600 border-gray-300 focus:ring-indigo-500 mr-4"
                    />
                    <span className="text-lg">{opt}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center mt-8 pt-6 border-t">
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="px-6 py-2 border rounded font-medium disabled:opacity-50"
          >
            Previous
          </button>
          
          <button
            onClick={toggleFlag}
            className={`px-6 py-2 rounded font-medium flex items-center gap-2 ${
              flagged.has(currentIndex) ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {flagged.has(currentIndex) ? '🚩 Flagged' : '⚑ Flag for Review'}
          </button>

          <button
            onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}
            disabled={currentIndex === questions.length - 1}
            className="px-6 py-2 bg-indigo-100 text-indigo-700 rounded font-medium disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <div className="md:w-1/4 bg-white p-6 rounded-lg shadow-lg">
        <h3 className="font-bold mb-4 text-center">Question Palette</h3>
        <div className="grid grid-cols-5 gap-2 mb-8">
          {questions.map((q, i) => {
            const isAnswered = !!answers[q.hash];
            const isFlagged = flagged.has(i);
            const isCurrent = currentIndex === i;
            
            let bgClass = 'bg-gray-100 text-gray-700';
            if (isAnswered) bgClass = 'bg-green-500 text-white border-green-600';
            if (isFlagged) bgClass = isAnswered ? 'bg-green-500 border-orange-500 text-white' : 'bg-orange-500 text-white border-orange-600';
            if (isCurrent) bgClass += ' ring-2 ring-indigo-500 ring-offset-2';

            return (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`w-10 h-10 rounded border-b-4 flex items-center justify-center font-bold text-sm ${bgClass}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <div className="space-y-2 text-sm text-gray-600 mb-8">
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-500 rounded"></div> Answered</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-orange-500 rounded"></div> Flagged</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 bg-gray-100 rounded border"></div> Not Visited</div>
        </div>

        <button
          onClick={handleSubmit}
          className="w-full py-4 bg-green-500 text-white font-bold rounded shadow hover:bg-green-600 transition"
        >
          Submit Exam
        </button>
      </div>
    </div>
  );
};
