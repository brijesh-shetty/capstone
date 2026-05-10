import express, { Express } from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRoutes from './routes/auth';
import topicsRoutes from './routes/topics';
import gamesRoutes from './routes/games';
import dashboardRoutes from './routes/dashboard';
import domainsRoutes from './routes/domains';
import achievementsRoutes from './routes/achievements';
import interviewRoutes from './routes/interview';
import leaderboardRoutes from './routes/leaderboard';
import { authMiddleware } from './middleware/auth';

const app: Express = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/topics', topicsRoutes);
app.use('/games', gamesRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/domains', domainsRoutes);
app.use('/achievements', achievementsRoutes);
app.use('/interview', interviewRoutes);
app.use('/leaderboard', leaderboardRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: '🎮 LearnHub API Server', status: 'running', endpoints: ['/health', '/auth/login', '/auth/register', '/topics', '/games', '/dashboard'] });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Test protected route
app.get('/protected', authMiddleware, (req, res) => {
  res.json({ message: 'This is a protected route', userId: (req as any).userId });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Phase 1 server initialized`);
});
