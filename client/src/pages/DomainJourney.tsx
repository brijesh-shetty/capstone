import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';

interface TopicNode {
  id: string;
  topic: string;
  subtopic: string;
  levelOrder: number;
  isUnlocked: boolean;
  isCompleted: boolean;
  bestScore: number;
  gamesPlayed: number;
}

interface DomainData {
  domain: {
    id: string;
    name: string;
    color: string;
    description: string;
  };
  progress: {
    currentLevel: number;
    totalXpInDomain: number;
    rank: string;
  };
  topics: TopicNode[];
}

interface DomainJourneyProps {
  domainSlug: string;
  onSelectTopic: (topicId: string, topicName: string) => void;
  onLearnConcept: (topicId: string) => void;
  onBack: () => void;
}

export const DomainJourney: React.FC<DomainJourneyProps> = ({ domainSlug, onSelectTopic, onLearnConcept, onBack }) => {
  const [data, setData] = useState<DomainData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await apiClient.get<DomainData>(`/domains/${domainSlug}`);
        setData(response);
      } catch (error) {
        console.error('Failed to load journey', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [domainSlug]);

  if (loading || !data) {
    return <div className="text-center py-20 text-xl font-bold animate-pulse">Loading Journey...</div>;
  }

  // Group topics by level
  const levels = [1, 2, 3, 4];
  const topicsByLevel = levels.reduce((acc, level) => {
    acc[level] = data.topics.filter(t => t.levelOrder === level);
    return acc;
  }, {} as Record<number, TopicNode[]>);

  const { domain, progress } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-md p-6 mb-12 border-t-4" style={{ borderColor: domain.color }}>
        <button onClick={onBack} className="text-gray-500 hover:text-gray-800 font-semibold mb-4 block">
          &larr; Back to Domains
        </button>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-2">{domain.name} Journey</h1>
            <p className="text-gray-600">{domain.description}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500 font-semibold uppercase tracking-wide">Current Rank</div>
            <div className="text-2xl font-black" style={{ color: domain.color }}>{progress.rank}</div>
            <div className="text-sm font-mono text-gray-500">{progress.totalXpInDomain} XP</div>
          </div>
        </div>
      </div>

      {/* Skill Tree */}
      <div className="relative">
        {/* Vertical line connecting levels */}
        <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gray-200 transform -translate-x-1/2 z-0"></div>

        {levels.map(level => {
          const topics = topicsByLevel[level] || [];
          if (topics.length === 0) return null;
          
          const isLevelUnlocked = level <= progress.currentLevel;
          const isCurrentLevel = level === progress.currentLevel;

          return (
            <div key={level} className="relative z-10 mb-16">
              <div className="flex justify-center mb-6">
                <span 
                  className={`px-6 py-2 rounded-full font-bold shadow-md border-2 ${isLevelUnlocked ? 'bg-white' : 'bg-gray-100 text-gray-400 border-gray-200'}`}
                  style={{ borderColor: isLevelUnlocked ? domain.color : undefined, color: isCurrentLevel ? domain.color : undefined }}
                >
                  Level {level}
                </span>
              </div>

              <div className="flex flex-wrap justify-center gap-6">
                {topics.map(topic => (
                  <div 
                    key={topic.id}
                    className={`w-64 bg-white rounded-xl shadow-lg border-2 p-5 transition-all ${
                      topic.isUnlocked ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1' : 'opacity-60 grayscale cursor-not-allowed border-gray-200'
                    } ${topic.isCompleted ? 'border-green-400' : topic.isUnlocked ? `border-[${domain.color}]` : ''}`}
                    style={{ borderColor: topic.isUnlocked && !topic.isCompleted ? domain.color : undefined }}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-lg leading-tight text-gray-800">{topic.subtopic}</h3>
                      {topic.isCompleted ? (
                        <span className="text-xl" title="Completed">✅</span>
                      ) : !topic.isUnlocked ? (
                        <span className="text-xl" title="Locked">🔒</span>
                      ) : (
                        <span className="text-xl animate-pulse" title="In Progress">🔓</span>
                      )}
                    </div>
                    
                    {topic.isUnlocked ? (
                      <div className="text-sm text-gray-500 mb-4">
                        Best Score: <span className="font-mono font-bold text-gray-700">{topic.bestScore}%</span><br/>
                        Attempts: {topic.gamesPlayed}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 mb-4 italic">Complete Level {level-1} to unlock</div>
                    )}

                    <div className="flex flex-col gap-2">
                      {topic.levelOrder >= 3 && topic.isUnlocked && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onLearnConcept(topic.id); }}
                          className="w-full py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-bold rounded shadow-sm text-sm"
                        >
                          📖 Read Tutorial
                        </button>
                      )}
                      <button
                        disabled={!topic.isUnlocked}
                        onClick={() => onSelectTopic(topic.id, topic.subtopic)}
                        className={`w-full py-2 font-bold rounded shadow-sm text-sm text-white ${!topic.isUnlocked ? 'bg-gray-300' : ''}`}
                        style={{ backgroundColor: topic.isUnlocked ? domain.color : undefined }}
                      >
                        {topic.isUnlocked ? '🎮 Play Games' : 'Locked'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
