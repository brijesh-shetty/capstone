import React, { useState } from 'react';
import { apiClient } from '../services/api';
import { TestSetup } from './TestSetup';
import { TestExecution } from './TestExecution';
import { TestAnalysis } from './TestAnalysis';

interface TestPortalProps {
  onBack: () => void;
}

export const TestPortal: React.FC<TestPortalProps> = ({ onBack }) => {
  const [view, setView] = useState<'setup' | 'execution' | 'analysis'>('setup');
  
  // Execution state
  const [testSessionKey, setTestSessionKey] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [config, setConfig] = useState<any>(null);
  
  // Analysis state
  const [testId, setTestId] = useState<string | null>(null);

  const handleStartTest = (sessionKey: string, q: any[], c: any) => {
    setTestSessionKey(sessionKey);
    setQuestions(q);
    setConfig(c);
    setView('execution');
  };

  const handleSubmitTest = async (answersObj: Record<string, string>) => {
    try {
      const answersArray = questions.map(q => ({
        hash: q.hash,
        chosenAnswer: answersObj[q.hash] || 'skipped'
      }));

      const data = await apiClient.post<any>('/tests/submit', {
        testSessionKey,
        answers: answersArray
      });
      
      setTestId(data.testId);
      setView('analysis');
    } catch (error) {
      console.error('Failed to submit test', error);
      alert('Failed to submit test.');
      onBack();
    }
  };

  if (view === 'setup') {
    return <TestSetup onStartTest={handleStartTest} onBack={onBack} />;
  }

  if (view === 'execution' && questions.length > 0 && config) {
    return <TestExecution questions={questions} config={config} onSubmit={handleSubmitTest} />;
  }

  if (view === 'analysis' && testId) {
    return <TestAnalysis testId={testId} onBack={onBack} />;
  }

  return <div>Loading...</div>;
};
