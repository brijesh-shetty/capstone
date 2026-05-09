import React, { useEffect, useState } from 'react';

export interface AchievementToastProps {
  achievement: {
    name: string;
    description: string;
    icon: string;
    xpReward: number;
  };
  onDismiss: () => void;
}

export const AchievementToast: React.FC<AchievementToastProps> = ({ achievement, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Small delay to trigger the slide-in animation after mount
    const timerIn = setTimeout(() => setIsVisible(true), 100);
    
    // Auto dismiss after 5 seconds
    const timerOut = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300); // wait for exit animation
    }, 5000);

    return () => {
      clearTimeout(timerIn);
      clearTimeout(timerOut);
    };
  }, [onDismiss]);

  return (
    <div 
      className={`fixed top-24 right-4 z-50 transition-all duration-300 ease-out transform ${
        isVisible ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-full opacity-0 scale-95'
      }`}
    >
      <div className="bg-white rounded-xl shadow-2xl border-l-4 border-yellow-400 p-4 max-w-sm flex items-start gap-4">
        <div className="text-4xl animate-bounce">{achievement.icon}</div>
        <div className="flex-1">
          <div className="text-xs font-bold text-yellow-500 uppercase tracking-wider mb-1">
            Achievement Unlocked!
          </div>
          <h4 className="font-bold text-gray-900">{achievement.name}</h4>
          <p className="text-xs text-gray-600 mt-1">{achievement.description}</p>
          {achievement.xpReward > 0 && (
            <div className="mt-2 inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">
              +{achievement.xpReward} XP
            </div>
          )}
        </div>
        <button 
          onClick={() => {
            setIsVisible(false);
            setTimeout(onDismiss, 300);
          }} 
          className="text-gray-400 hover:text-gray-600"
        >
          &times;
        </button>
      </div>
    </div>
  );
};
