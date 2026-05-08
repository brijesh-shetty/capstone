import React, { useEffect, useState } from 'react';

interface TestTimerProps {
  initialMinutes: number;
  onTimeUp: () => void;
}

export const TestTimer: React.FC<TestTimerProps> = ({ initialMinutes, onTimeUp }) => {
  const [secondsLeft, setSecondsLeft] = useState(initialMinutes * 60);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onTimeUp();
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft, onTimeUp]);

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  
  const isWarning = secondsLeft < 300; // less than 5 minutes

  return (
    <div className={`font-mono text-2xl font-bold px-4 py-2 rounded ${isWarning ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-800'}`}>
      {m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
    </div>
  );
};
