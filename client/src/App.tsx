import React, { useState, useEffect } from 'react';
import { apiClient } from './services/api';
import { SearchTopics } from './pages/SearchTopics';
import { GameSession } from './pages/GameSession';
import { GameArcade } from './pages/GameArcade';
import { MemoryMatch } from './pages/games/MemoryMatch';
import { WordScramble } from './pages/games/WordScramble';
import { CrosswordPuzzle } from './pages/games/CrosswordPuzzle';
import { Hangman } from './pages/games/Hangman';
import { FillTheBlank } from './pages/games/FillTheBlank';
import { ConceptCannon } from './pages/games/ConceptCannon';
import { DashboardPage } from './pages/Dashboard';

import { InterviewHub } from './pages/InterviewHub';
import { InterviewCategory } from './pages/InterviewCategory';
import { InterviewTheory } from './pages/InterviewTheory';
import { InterviewQuiz } from './pages/InterviewQuiz';
import { InterviewGameSelect } from './pages/InterviewGameSelect';
import { FormulaFlashCards } from './pages/games/FormulaFlashCards';
import { FormulaMatch } from './pages/games/FormulaMatch';
import { ConceptSprint } from './pages/games/ConceptSprint';

import { DomainSelection } from './pages/DomainSelection';
import { DomainJourney } from './pages/DomainJourney';
import { ConceptTutorial } from './pages/ConceptTutorial';
import { AchievementsPage } from './pages/AchievementsPage';
import { AchievementToast } from './components/AchievementToast';
import { LeaderboardPage } from './pages/Leaderboard';
import { ReviewQueue } from './pages/ReviewQueue';
import { AssessmentList } from './pages/AssessmentList';
import { AssessmentRunner } from './pages/AssessmentRunner';
import { TestBuilder } from './pages/TestBuilder';
import { AdminReports } from './pages/AdminReports';
import { InterviewChat } from './pages/InterviewChat';
import { InterviewRoom } from './pages/InterviewRoom';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  level: number;
  xpTotal: number;
  streakDays: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('token'),
    loading: false
  });
  const [currentPage, setCurrentPage] = useState(() => sessionStorage.getItem('currentPage') || 'home');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(() => sessionStorage.getItem('selectedTopicId'));
  const [selectedTopicName, setSelectedTopicName] = useState<string>(() => sessionStorage.getItem('selectedTopicName') || '');
  const [selectedGameType, setSelectedGameType] = useState<string | null>(() => sessionStorage.getItem('selectedGameType'));
  const [error, setError] = useState<string | null>(null);

  const [selectedDomainSlug, setSelectedDomainSlug] = useState<string | null>(() => sessionStorage.getItem('selectedDomainSlug'));
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(() => sessionStorage.getItem('selectedAssessmentId'));
  const [videoInterviewConfig, setVideoInterviewConfig] = useState<{ role: string; companyId: string | null } | null>(null);
  const [completedInterviewId, setCompletedInterviewId] = useState<string | null>(null);
  const [selectedInterviewCategorySlug, setSelectedInterviewCategorySlug] = useState<string | null>(() => sessionStorage.getItem('selectedInterviewCategorySlug'));
  const [selectedInterviewTopicId, setSelectedInterviewTopicId] = useState<string | null>(() => sessionStorage.getItem('selectedInterviewTopicId'));
  const [achievementQueue, setAchievementQueue] = useState<any[]>([]);

  useEffect(() => {
    if (auth.token) {
      apiClient.setToken(auth.token);
    }
  }, [auth.token]);

  useEffect(() => {
    sessionStorage.setItem('currentPage', currentPage);
    if (selectedTopicId) sessionStorage.setItem('selectedTopicId', selectedTopicId); else sessionStorage.removeItem('selectedTopicId');
    if (selectedTopicName) sessionStorage.setItem('selectedTopicName', selectedTopicName); else sessionStorage.removeItem('selectedTopicName');
    if (selectedGameType) sessionStorage.setItem('selectedGameType', selectedGameType); else sessionStorage.removeItem('selectedGameType');
    if (selectedDomainSlug) sessionStorage.setItem('selectedDomainSlug', selectedDomainSlug); else sessionStorage.removeItem('selectedDomainSlug');
    if (selectedAssessmentId) sessionStorage.setItem('selectedAssessmentId', selectedAssessmentId); else sessionStorage.removeItem('selectedAssessmentId');
    if (selectedInterviewCategorySlug) sessionStorage.setItem('selectedInterviewCategorySlug', selectedInterviewCategorySlug); else sessionStorage.removeItem('selectedInterviewCategorySlug');
    if (selectedInterviewTopicId) sessionStorage.setItem('selectedInterviewTopicId', selectedInterviewTopicId); else sessionStorage.removeItem('selectedInterviewTopicId');
  }, [currentPage, selectedTopicId, selectedTopicName, selectedGameType, selectedDomainSlug, selectedInterviewCategorySlug, selectedInterviewTopicId]);

  // Intercept fetch responses globally for achievements if possible, or just poll
  // A simple hack: check for achievements globally in responses
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const cloned = response.clone();
      try {
        const data = await cloned.json();
        if (data && data.earnedAchievements && data.earnedAchievements.length > 0) {
          setAchievementQueue(prev => [...prev, ...data.earnedAchievements]);
        }
      } catch (e) {
        // Not JSON or other error
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const handleRegister = async (name: string, email: string, password: string, role: string) => {
    setError(null);
    setAuth({ ...auth, loading: true });
    try {
      const response = await apiClient.post<any>('/auth/register', {
        name,
        email,
        password,
        role
      });
      localStorage.setItem('token', response.token);
      apiClient.setToken(response.token);
      setAuth({ user: response.user, token: response.token, loading: false });
      setCurrentPage('dashboard');
    } catch (error) {
      const msg = 'Registration failed. Please try again.';
      setError(msg);
      console.error('Register failed:', error);
      setAuth({ ...auth, loading: false });
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setError(null);
    setAuth({ ...auth, loading: true });
    try {
      const response = await apiClient.post<any>('/auth/login', { email, password });
      localStorage.setItem('token', response.token);
      apiClient.setToken(response.token);
      setAuth({ user: response.user, token: response.token, loading: false });
      setCurrentPage('dashboard');
    } catch (error) {
      const msg = 'Login failed. Please check your credentials.';
      setError(msg);
      console.error('Login failed:', error);
      setAuth({ ...auth, loading: false });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    apiClient.setToken(null);
    setAuth({ user: null, token: null, loading: false });
    setCurrentPage('home');
    setError(null);
  };

  const handleSelectTopic = (topicId: string, topicName: string) => {
    setSelectedTopicId(topicId);
    setSelectedTopicName(topicName);
    setCurrentPage('arcade');
  };

  const handleSelectGame = (topicId: string, topicName: string, gameType: string) => {
    setSelectedTopicId(topicId);
    setSelectedTopicName(topicName);
    setSelectedGameType(gameType);
    setCurrentPage('game');
  };

  const handleGameComplete = () => {
    setCurrentPage('dashboard');
    setSelectedTopicId(null);
    setSelectedTopicName('');
    setSelectedGameType(null);
    
    // Refresh user object to get new XP
    apiClient.get<User>('/protected').then(res => {
      // In a real app we'd fetch the user profile. For now, we assume Dashboard will refetch or we just wait.
      // Wait, `/protected` doesn't return full user.
    }).catch(() => {});
  };

  const dismissToast = () => {
    setAchievementQueue(prev => prev.slice(1));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-slate-50 to-violet-100 relative">
      {/* Achievement Toasts */}
      {achievementQueue.length > 0 && (
        <AchievementToast 
          key={achievementQueue[0].id} 
          achievement={achievementQueue[0]} 
          onDismiss={dismissToast} 
        />
      )}

      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 shadow-soft sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <button
            onClick={() => {
              setCurrentPage(auth.user ? 'dashboard' : 'home');
              setError(null);
            }}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">🎮</span>
            <span className="text-2xl font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              LearnHub
            </span>
          </button>
          <div>
            {auth.user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full">
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-bold flex items-center justify-center">
                    {auth.user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-semibold text-gray-800 text-sm">{auth.user.name}</span>
                  <span className="text-xs font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-100">
                    Lv {auth.user.level}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCurrentPage('login');
                    setError(null);
                  }}
                  className="btn-ghost px-4 py-2 text-sm"
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    setCurrentPage('register');
                    setError(null);
                  }}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  Sign Up Free
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 mt-4 rounded-xl shadow-soft animate-fade-in">
            <span className="text-lg">⚠️</span>
            <p className="font-medium text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Page Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {currentPage === 'home' && !auth.user && (
          <div className="text-center py-10 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 bg-indigo-50 border border-indigo-100 rounded-full text-sm font-semibold text-indigo-700">
              ✨ Learn smarter, play harder
            </div>
            <h2 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-5 leading-tight">
              Level up your skills with{' '}
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                LearnHub
              </span>
            </h2>
            <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
              Master 8 learning domains through games, ace your placements with curated
              interview prep, and climb the leaderboard — one XP at a time.
            </p>
            <div className="flex justify-center gap-4 mb-16">
              <button
                onClick={() => setCurrentPage('register')}
                className="btn-primary px-8 py-4 text-lg"
              >
                Get Started Free →
              </button>
              <button
                onClick={() => setCurrentPage('login')}
                className="btn-ghost px-8 py-4 text-lg"
              >
                Login
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left">
              {[
                { icon: '🎮', title: '7 Game Engines', desc: 'Memory Match, Hangman, Crosswords and more — every topic becomes a game.' },
                { icon: '🎯', title: 'Interview Prep', desc: '470+ curated aptitude questions with theory notes, formulas and solved examples.' },
                { icon: '🏆', title: 'XP & Achievements', desc: 'Earn XP, unlock achievements, keep your streak alive and top the leaderboard.' },
              ].map((f) => (
                <div key={f.title} className="card card-hover p-6">
                  <div className="w-12 h-12 flex items-center justify-center text-2xl bg-indigo-50 rounded-xl mb-4">
                    {f.icon}
                  </div>
                  <h3 className="font-bold text-lg text-gray-900 mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentPage === 'login' && !auth.user && (
          <LoginPage onLogin={handleLogin} loading={auth.loading} />
        )}

        {currentPage === 'register' && !auth.user && (
          <RegisterPage onRegister={handleRegister} loading={auth.loading} />
        )}

        {currentPage === 'dashboard' && auth.user && (
          <DashboardPage user={auth.user} setCurrentPage={setCurrentPage} />
        )}

        {/* DOMAIN HUB ROUTES */}
        {currentPage === 'domains' && auth.user && (
          <DomainSelection 
            onSelectDomain={(slug) => { setSelectedDomainSlug(slug); setCurrentPage('journey'); }}
            onBack={() => setCurrentPage('dashboard')}
          />
        )}

        {currentPage === 'journey' && auth.user && selectedDomainSlug && (
          <DomainJourney
            domainSlug={selectedDomainSlug}
            onSelectTopic={(id, name) => { handleSelectTopic(id, name); }}
            onLearnConcept={(id) => { setSelectedTopicId(id); setCurrentPage('tutorial'); }}
            onBack={() => setCurrentPage('domains')}
          />
        )}

        {currentPage === 'tutorial' && auth.user && selectedTopicId && (
          <ConceptTutorial
            topicId={selectedTopicId}
            onReadyToPlay={() => { 
              setCurrentPage('arcade'); 
            }}
            onBack={() => setCurrentPage('journey')}
          />
        )}

        {currentPage === 'achievements' && auth.user && (
          <AchievementsPage onBack={() => setCurrentPage('dashboard')} />
        )}

        {currentPage === 'review-queue' && auth.user &&
          (auth.user.role === 'ADMIN' || auth.user.role === 'EDUCATOR') && (
          <ReviewQueue onBack={() => setCurrentPage('dashboard')} />
        )}

        {currentPage === 'test-builder' && auth.user &&
          (auth.user.role === 'ADMIN' || auth.user.role === 'EDUCATOR') && (
          <TestBuilder onBack={() => setCurrentPage('dashboard')} />
        )}

        {currentPage === 'assessments' && auth.user && (
          <AssessmentList
            onStart={(testId) => { setSelectedAssessmentId(testId); setCurrentPage('assessment-runner'); }}
            onBack={() => setCurrentPage('dashboard')}
          />
        )}

        {currentPage === 'assessment-runner' && auth.user && selectedAssessmentId && (
          <AssessmentRunner
            key={selectedAssessmentId}
            testId={selectedAssessmentId}
            onExit={() => { setSelectedAssessmentId(null); setCurrentPage('assessments'); }}
            onPractice={(newTestId) => setSelectedAssessmentId(newTestId)}
          />
        )}

        {currentPage === 'admin-reports' && auth.user &&
          (auth.user.role === 'ADMIN' || auth.user.role === 'EDUCATOR') && (
          <AdminReports onBack={() => setCurrentPage('dashboard')} />
        )}

        {currentPage === 'ai-interview' && auth.user && (
          <InterviewChat
            onBack={() => { setCompletedInterviewId(null); setCurrentPage('dashboard'); }}
            initialInterviewId={completedInterviewId}
            onStartVideo={(role, companyId) => {
              setCompletedInterviewId(null);
              setVideoInterviewConfig({ role, companyId });
              setCurrentPage('interview-room');
            }}
          />
        )}

        {currentPage === 'interview-room' && auth.user && videoInterviewConfig && (
          <InterviewRoom
            role={videoInterviewConfig.role}
            companyId={videoInterviewConfig.companyId}
            onExit={() => { setVideoInterviewConfig(null); setCurrentPage('ai-interview'); }}
            onComplete={(interviewId) => {
              setVideoInterviewConfig(null);
              setCompletedInterviewId(interviewId);
              setCurrentPage('ai-interview');
            }}
          />
        )}

        {currentPage === 'leaderboard' && auth.user && (
          <div>
            <div className="mb-4">
              <button
                onClick={() => setCurrentPage('dashboard')}
                className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-2"
              >
                ← Back to Dashboard
              </button>
            </div>
            <LeaderboardPage />
          </div>
        )}

        {/* INTERVIEW PREP ROUTES */}
        {currentPage === 'interview-hub' && auth.user && (
          <InterviewHub
            onSelectCategory={(slug) => {
              setSelectedInterviewCategorySlug(slug);
              setCurrentPage('interview-category');
            }}
            onBack={() => setCurrentPage('dashboard')}
          />
        )}

        {currentPage === 'interview-category' && auth.user && selectedInterviewCategorySlug && (
          <InterviewCategory
            categorySlug={selectedInterviewCategorySlug}
            onSelectTheory={(topicId) => {
              setSelectedInterviewTopicId(topicId);
              setCurrentPage('interview-theory');
            }}
            onSelectQuiz={(topicId, topicName) => {
              setSelectedInterviewTopicId(topicId);
              setSelectedTopicName(topicName); // Reuse this for simplicity
              setCurrentPage('interview-quiz');
            }}
            onSelectGames={(topicId, topicName) => {
              setSelectedInterviewTopicId(topicId);
              setSelectedTopicName(topicName);
              setCurrentPage('interview-game-select');
            }}
            onBack={() => setCurrentPage('interview-hub')}
          />
        )}

        {currentPage === 'interview-theory' && auth.user && selectedInterviewTopicId && (
          <InterviewTheory
            topicId={selectedInterviewTopicId}
            onReadyToPractice={() => setCurrentPage('interview-quiz')}
            onBack={() => setCurrentPage('interview-category')}
          />
        )}

        {currentPage === 'interview-quiz' && auth.user && selectedInterviewTopicId && (
          <InterviewQuiz
            topicId={selectedInterviewTopicId}
            topicName={selectedTopicName}
            onComplete={() => setCurrentPage('interview-hub')}
            onReviewTheory={() => setCurrentPage('interview-theory')}
          />
        )}

        {currentPage === 'interview-game-select' && auth.user && selectedInterviewTopicId && (
          <InterviewGameSelect
            topicId={selectedInterviewTopicId}
            topicName={selectedTopicName}
            onSelectGame={(gameId) => setCurrentPage(`interview-${gameId}`)}
            onBack={() => setCurrentPage('interview-category')}
          />
        )}

        {currentPage === 'interview-flashcards' && auth.user && selectedInterviewTopicId && (
          <FormulaFlashCards
            topicId={selectedInterviewTopicId}
            topicName={selectedTopicName}
            onComplete={() => setCurrentPage('interview-game-select')}
          />
        )}

        {currentPage === 'interview-match' && auth.user && selectedInterviewTopicId && (
          <FormulaMatch
            topicId={selectedInterviewTopicId}
            topicName={selectedTopicName}
            onComplete={() => setCurrentPage('interview-game-select')}
          />
        )}

        {currentPage === 'interview-sprint' && auth.user && selectedInterviewTopicId && (
          <ConceptSprint
            topicId={selectedInterviewTopicId}
            topicName={selectedTopicName}
            onComplete={() => setCurrentPage('interview-game-select')}
          />
        )}

        {/* LEGACY SEARCH TOPICS */}
        {currentPage === 'search' && auth.user && (
          <SearchTopics onSelectTopic={handleSelectTopic} />
        )}

        {/* GAME ARCADE ROUTES */}
        {currentPage === 'arcade' && auth.user && selectedTopicId && (
          <GameArcade
            topicId={selectedTopicId}
            topicName={selectedTopicName}
            onSelectGame={handleSelectGame}
            onBack={() => setCurrentPage('journey')}
          />
        )}

        {currentPage === 'game' && auth.user && selectedTopicId && selectedGameType && (
          <div>
            <div className="mb-6 max-w-4xl mx-auto">
              <button 
                onClick={() => setCurrentPage('arcade')} 
                className="text-red-500 hover:text-red-700 font-bold transition-colors flex items-center"
              >
                <span className="mr-2">🚪</span> Quit Game & Return to Arcade
              </button>
            </div>
            {selectedGameType === 'MCQ' && (
              <GameSession
                topicId={selectedTopicId}
                topicName={selectedTopicName}
                onGameComplete={handleGameComplete}
              />
            )}
            {selectedGameType === 'MEMORY_MATCH' && (
              <MemoryMatch
                topicId={selectedTopicId}
                topicName={selectedTopicName}
                onGameComplete={handleGameComplete}
              />
            )}
            {selectedGameType === 'WORD_SCRAMBLE' && (
              <WordScramble
                topicId={selectedTopicId}
                topicName={selectedTopicName}
                onGameComplete={handleGameComplete}
              />
            )}
            {selectedGameType === 'CROSSWORD' && (
              <CrosswordPuzzle
                topicId={selectedTopicId}
                topicName={selectedTopicName}
                onGameComplete={handleGameComplete}
              />
            )}
            {selectedGameType === 'HANGMAN' && (
              <Hangman
                topicId={selectedTopicId}
                topicName={selectedTopicName}
                onGameComplete={handleGameComplete}
              />
            )}
            {selectedGameType === 'FILL_BLANK' && (
              <FillTheBlank
                topicId={selectedTopicId}
                topicName={selectedTopicName}
                onGameComplete={handleGameComplete}
              />
            )}
            {selectedGameType === 'CONCEPT_CANNON' && (
              <ConceptCannon
                topicId={selectedTopicId}
                topicName={selectedTopicName}
                onGameComplete={handleGameComplete}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const LoginPage: React.FC<{ onLogin: (email: string, password: string) => void; loading: boolean }> = ({ onLogin, loading }) => {
  const [email, setEmail] = useState('student@example.com');
  const [password, setPassword] = useState('password');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="max-w-md mx-auto card p-8 animate-fade-in-up">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-3 flex items-center justify-center text-3xl bg-indigo-50 rounded-2xl">👋</div>
        <h2 className="text-3xl font-extrabold text-gray-900">Welcome back</h2>
        <p className="text-sm text-gray-500 mt-1">Login to continue your learning streak</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <p className="text-xs text-gray-400 mt-5 text-center">Demo: student@example.com / password</p>
    </div>
  );
};

const RegisterPage: React.FC<{ onRegister: (name: string, email: string, password: string, role: string) => void; loading: boolean }> = ({ onRegister, loading }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('STUDENT');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRegister(name, email, password, role);
  };

  return (
    <div className="max-w-md mx-auto card p-8 animate-fade-in-up">
      <div className="text-center mb-6">
        <div className="w-14 h-14 mx-auto mb-3 flex items-center justify-center text-3xl bg-violet-50 rounded-2xl">🚀</div>
        <h2 className="text-3xl font-extrabold text-gray-900">Create your account</h2>
        <p className="text-sm text-gray-500 mt-1">Start earning XP in under a minute</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
          <input
            type="text"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">User Type</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input"
          >
            <option value="STUDENT">Student</option>
            <option value="COLLEGE_STUDENT">College Student</option>
            <option value="EDUCATOR">Educator</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    </div>
  );
};

export default App;
