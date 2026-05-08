import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface StudyPlanItem {
  id: string;
  topicId: string;
  topic: {
    subject: string;
    topic: string;
    subtopic: string;
  };
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate: string;
}

interface StudyPlanProps {
  onSelectTopic: (topicId: string, topicName: string) => void;
  onExplainTopic?: (topicId: string, topicName: string) => void;
}

export const StudyPlanPage: React.FC<StudyPlanProps> = ({ onSelectTopic, onExplainTopic }) => {
  const [plans, setPlans] = useState<StudyPlanItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const data = await apiClient.get<StudyPlanItem[]>('/study-plan');
        setPlans(data);
      } catch (error) {
        console.error('Failed to fetch study plan', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPlan();
  }, []);

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'HIGH': return 'bg-red-100 text-red-800 border-red-200';
      case 'MEDIUM': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  if (loading) return <div className="text-center py-8">Loading your study plan...</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white p-8 rounded-lg shadow-lg mb-6">
        <h2 className="text-3xl font-bold mb-2">Targeted Study Plan 🎯</h2>
        <p className="text-purple-100">Focus on these topics to improve your overall mastery.</p>
      </div>

      {plans.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <span className="text-4xl block mb-4">🌟</span>
          <h3 className="text-xl font-bold text-gray-800 mb-2">You're all caught up!</h3>
          <p className="text-gray-600">No weak topics detected. Play more games or take a test to generate new recommendations.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map(plan => (
            <div key={plan.id} className="bg-white p-6 rounded-lg shadow flex flex-col md:flex-row md:items-center justify-between border-l-4" style={{ borderLeftColor: plan.priority === 'HIGH' ? '#ef4444' : plan.priority === 'MEDIUM' ? '#f97316' : '#3b82f6' }}>
              <div className="mb-4 md:mb-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-bold text-lg">{plan.topic.subtopic}</h3>
                  <span className={`text-xs px-2 py-1 rounded font-semibold border ${getPriorityColor(plan.priority)}`}>
                    {plan.priority} PRIORITY
                  </span>
                </div>
                <p className="text-sm text-gray-600">{plan.topic.subject} • {plan.topic.topic}</p>
                {plan.dueDate && (
                  <p className="text-xs text-gray-500 mt-2">
                    Review by: {new Date(plan.dueDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <button
                  onClick={() => onExplainTopic && onExplainTopic(plan.topicId, plan.topic.subtopic)}
                  className="w-full md:w-auto px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded shadow transition"
                >
                  Explain Concept
                </button>
                <button
                  onClick={() => onSelectTopic(plan.topicId, plan.topic.subtopic)}
                  className="w-full md:w-auto px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded shadow transition"
                >
                  Practice Now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
