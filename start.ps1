Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Starting Gamified Learning Platform..." -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Starting Docker containers (PostgreSQL, Redis, Piston)..." -ForegroundColor Yellow
docker compose up -d

Write-Host ""
Write-Host "[2/3] Starting Backend Server (Port 4000)..." -ForegroundColor Yellow
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c cd server && npm run dev"

Write-Host ""
Write-Host "[3/3] Starting Frontend Client (Port 5173)..." -ForegroundColor Yellow
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c cd client && npm run dev"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "All services are starting up!" -ForegroundColor Green
Write-Host "Wait a few seconds, then open:"
Write-Host "http://localhost:5173" -ForegroundColor White
Write-Host "=========================================" -ForegroundColor Cyan
