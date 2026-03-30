@echo off
REM MindMitra - Startup Script for Windows
REM This script starts both backend (Flask) and frontend (HTTP Server)

title MindMitra - Startup

echo.
echo ========================================
echo    MindMitra - Starting Application
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

echo [1/4] Installing Python dependencies...
cd backend
pip install -q -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
cd ..

echo [2/4] Starting Flask Backend...
start "MindMitra Backend" cmd /k "cd backend && python app.py"
timeout /t 2 /nobreak

echo [3/4] Starting Frontend HTTP Server...
start "MindMitra Frontend" cmd /k "cd frontend && python -m http.server 8000"
timeout /t 2 /nobreak

echo [4/4] Opening browser...
timeout /t 3 /nobreak
start http://localhost:8000

echo.
echo ========================================
echo    MindMitra is Running!
echo ========================================
echo.
echo Frontend: http://localhost:8000
echo Backend:  http://localhost:5000
echo.
echo Close these windows to stop the application.
echo.
pause
