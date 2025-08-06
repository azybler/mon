#!/bin/bash

# Build script for mon application
set -e

echo "🏗️  Building mon application..."

# Navigate to the UI directory and build the React app
echo "📦 Building React frontend..."
cd ui/mon-app
npm install
npm run build

# Navigate back to the root
cd ../..

# Copy the built React app to the API directory
echo "📁 Copying build files to API directory..."
rm -rf api/dist
cp -r ui/mon-app/dist api/

# Navigate to the API directory and build the Go backend
echo "🔧 Building Go backend..."
cd api
CGO_CFLAGS="-I/opt/homebrew/include" CGO_LDFLAGS="-L/opt/homebrew/lib" go build -o mon-api .

echo "✅ Build complete!"
echo "🚀 To run the application: cd api && ./mon-api"
echo "📱 The app will be available at: http://localhost:8081"
