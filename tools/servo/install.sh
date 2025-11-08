# tools/servo/install.sh
#!/bin/bash

echo "📦 Installing Servo..."

cd "$(dirname "$0")"

# Build
./build.sh

# Install globally (optional)
if [ "$1" = "--global" ]; then
    sudo cp servo /usr/local/bin/servo
    echo "✅ Servo installed globally! Run from anywhere with: servo"
else
    echo "✅ Servo built! Run with: ./servo"
    echo "   To install globally, run: ./install.sh --global"
fi