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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 relative">
      {/* Achievement Toasts */}
      {achievementQueue.length > 0 && (
        <AchievementToast 
          key={achievementQueue[0].id} 
          achievement={achievementQueue[0]} 
          onDismiss={dismissToast} 
        />
      )}

      {/* Navigation */}
      <nav className="bg-white shadow-lg relative z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <button
            onClick={() => {
              setCurrentPage(auth.user ? 'dashboard' : 'home');
              setError(null);
            }}
            className="text-2xl font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
          >
            🎮 LearnHub
          </button>
          <div>
            {auth.user ? (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-semibold text-gray-800">{auth.user.name}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 font-semibold"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setCurrentPage('login');
                    setError(null);
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 font-semibold"
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    setCurrentPage('register');
                    setError(null);
                  }}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 font-semibold"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 max-w-7xl mx-auto mt-4 rounded">
          {error}
        </div>
      )}

      {/* Page Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {currentPage === 'home' && !auth.user && (
          <div className="text-center">
            <h2 className="text-5xl font-bold text-gray-800 mb-4">Welcome to LearnHub</h2>
            <p className="text-xl text-gray-600 mb-8">
              🎓 Learn through gamified quizzes • 🎮 Play engaging games • 🏆 Earn XP and level up!
            </p>
            <div className="space-x-4">
              <button
                onClick={() => setCurrentPage('login')}
                className="px-8 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-bold text-lg"
              >
                Login
              </button>
              <button
                onClick={() => setCurrentPage('register')}
                className="px-8 py-4 bg-green-500 text-white rounded-lg hover:bg-green-600 font-bold text-lg"
              >
                Sign Up
              </button>
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
    <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-6 text-center">Login</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2">Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded focus:outline-none focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-2">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded focus:outline-none focus:border-blue-500"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 font-bold disabled:bg-gray-400"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      <p className="text-xs text-gray-500 mt-4 text-center">Demo: student@example.com / password</p>
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
    <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-6 text-center">Register</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2">Full Name</label>
          <input
            type="text"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border rounded focus:outline-none focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-2">Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border rounded focus:outline-none focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-2">Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border rounded focus:outline-none focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-2">User Type</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-4 py-2 border rounded focus:outline-none focus:border-blue-500"
          >
            <option value="STUDENT">Student</option>
            <option value="COLLEGE_STUDENT">College Student</option>
            <option value="EDUCATOR">Educator</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-3 bg-green-500 text-white rounded hover:bg-green-600 font-bold disabled:bg-gray-400"
        >
          {loading ? 'Creating account...' : 'Register'}
        </button>
      </form>
    </div>
  );
};

export default App;
