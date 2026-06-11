@echo off
echo =========================================
echo Stopping Gamified Learning Platform...
echo =========================================
echo.

echo [1/3] Stopping Backend Server (Port 4000)...
FOR /F "tokens=5" %%a IN ('netstat -aon ^| find "4000" ^| find "LISTENING"') DO taskkill /F /PID %%a >nul 2>&1

echo [2/3] Stopping Frontend Client (Port 5173)...
FOR /F "tokens=5" %%a IN ('netstat -aon ^| find "5173" ^| find "LISTENING"') DO taskkill /F /PID %%a >nul 2>&1

echo [3/3] Stopping Docker containers...
docker compose down

echo.
echo =========================================
echo All services stopped successfully!
echo =========================================
