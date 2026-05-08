import React, { useState, useEffect } from 'react';
import { apiClient } from './services/api';
import { SearchTopics } from './pages/SearchTopics';
import { GameSession } from './pages/GameSession';
import { DashboardPage } from './pages/Dashboard';
import { StudyPlanPage } from './pages/StudyPlan';
import { TestPortal } from './pages/TestPortal';
import { TopicExplainer } from './pages/TopicExplainer';
import { LeaderboardPage } from './pages/Leaderboard';

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
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedTopicName, setSelectedTopicName] = useState<string>('');
  const [preloadedSession, setPreloadedSession] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.token) {
      apiClient.setToken(auth.token);
    }
  }, [auth.token]);

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
    setPreloadedSession(null);
    setCurrentPage('game');
  };

  const handleExplainTopic = (topicId: string, topicName: string) => {
    setSelectedTopicId(topicId);
    setSelectedTopicName(topicName);
    setCurrentPage('topic-explainer');
  };

  const handleStartPractice = (sessionData: any) => {
    setSelectedTopicId(sessionData.topicId);
    setSelectedTopicName(sessionData.topicName);
    setPreloadedSession(sessionData);
    setCurrentPage('game');
  };

  const handleGameComplete = () => {
    setCurrentPage('dashboard');
    setSelectedTopicId(null);
    setSelectedTopicName('');
    setPreloadedSession(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Navigation */}
      <nav className="bg-white shadow-lg">
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
                  <p className="text-xs text-gray-600">Level {auth.user.level} • {auth.user.xpTotal} XP</p>
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

          {currentPage === 'search' && auth.user && (
            <SearchTopics onSelectTopic={handleSelectTopic} />
          )}

          {currentPage === 'game' && auth.user && selectedTopicId && (
            <GameSession
              topicId={selectedTopicId}
              topicName={selectedTopicName}
              onGameComplete={handleGameComplete}
              preloadedSessionData={preloadedSession}
            />
          )}

          {currentPage === 'study-plan' && auth.user && (
            <StudyPlanPage 
              onSelectTopic={handleSelectTopic} 
              onExplainTopic={handleExplainTopic} 
            />
          )}

          {currentPage === 'topic-explainer' && auth.user && selectedTopicId && (
            <TopicExplainer
              topicId={selectedTopicId}
              topicName={selectedTopicName}
              onClose={() => setCurrentPage('study-plan')}
              onStartPractice={handleStartPractice}
            />
          )}

          {currentPage === 'test-portal' && auth.user?.role === 'COLLEGE_STUDENT' && (
            <TestPortal onBack={() => setCurrentPage('dashboard')} />
          )}

          {currentPage === 'leaderboard' && auth.user && (
            <LeaderboardPage />
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
