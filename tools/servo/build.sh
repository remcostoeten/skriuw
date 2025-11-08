# tools/servo/build.sh
#!/bin/bash

echo "🔨 Building Servo..."

cd "$(dirname "$0")"

go mod init servo 2>/dev/null || true
go mod tidy
go build -o servo

echo "✅ Build complete! Run with: ./servo"