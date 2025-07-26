#!/bin/bash

# Development script for mon application
set -e

echo "🔧 Starting development environment..."

# Check if we're in development mode (running frontend separately)
if [ "$1" = "dev" ]; then
    echo "📦 Starting development servers..."
    
    # Start the Go backend in the background
    echo "🚀 Starting Go backend..."
    cd api
    go build -o mon-api . && ./mon-api &
    BACKEND_PID=$!
    cd ..
    
    # Start the React frontend
    echo "📱 Starting React frontend..."
    cd ui/mon-app
    npm run dev &
    FRONTEND_PID=$!
    
    # Wait for Ctrl+C and then kill both processes
    trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT
    wait
else
    # Production mode - build and run
    echo "🏗️  Building and starting production server..."
    ./build.sh
    cd api
    ./mon-api
fi
