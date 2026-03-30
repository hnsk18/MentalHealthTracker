#!/bin/bash
# MindMitra - Startup Script for macOS/Linux

echo ""
echo "========================================"
echo "   MindMitra - Starting Application"
echo "========================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null
then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.8+ from https://www.python.org/"
    exit 1
fi

echo "[1/4] Installing Python dependencies..."
cd backend
pip install -q -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi
cd ..

echo "[2/4] Starting Flask Backend..."
cd backend
python3 app.py &
BACKEND_PID=$!
cd ..
sleep 2

echo "[3/4] Starting Frontend HTTP Server..."
cd frontend
python3 -m http.server 8000 &
FRONTEND_PID=$!
cd ..
sleep 2

echo "[4/4] Opening browser..."
if command -v open &> /dev/null; then
    open http://localhost:8000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:8000
fi

echo ""
echo "========================================"
echo "    MindMitra is Running!"
echo "========================================"
echo ""
echo "Frontend: http://localhost:8000"
echo "Backend:  http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop the application"
echo ""

# Wait for both processes
wait
