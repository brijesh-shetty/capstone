@echo off
echo =========================================
echo Starting Gamified Learning Platform...
echo =========================================

echo.
echo [1/3] Starting Docker containers (PostgreSQL, Redis, Piston)...
docker compose up -d

echo.
echo [2/3] Starting Backend Server (Port 4000)...
start "Backend Server" cmd /k "cd server && npm run dev"

echo.
echo [3/3] Starting Frontend Client (Port 5173)...
start "Frontend Client" cmd /k "cd client && npm run dev"

echo.
echo =========================================
echo All services are starting up!
echo Wait a few seconds, then open:
echo http://localhost:5173
echo =========================================
