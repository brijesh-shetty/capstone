Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Stopping Gamified Learning Platform..." -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Stopping Backend Server (Port 4000)..."
Stop-Process -Id (Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] Stopping Frontend Client (Port 5173)..."
Stop-Process -Id (Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue

Write-Host "[3/3] Stopping Docker containers..."
docker compose down

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "All services stopped successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
