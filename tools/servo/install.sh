# tools/servo/install.sh
#!/bin/bash

# Handle uninstall
if [ "$1" = "--uninstall" ]; then
	echo "\033[0;31m🗑️  Uninstalling Servo...\033[0m"

	# Check if global uninstall requested
	if [ "$2" = "--global" ]; then
		# Remove global installation only
		if [ -f "/usr/local/bin/servo" ]; then
			sudo rm /usr/local/bin/servo
			echo "\033[0;32m✅ Removed global installation from /usr/local/bin/servo\033[0m"
		else
			echo "\033[0;33m⚠️  No global installation found\033[0m"
		fi
	else
		# Remove global installation if exists
		if [ -f "/usr/local/bin/servo" ]; then
			sudo rm /usr/local/bin/servo
			echo "\033[0;32m✅ Removed global installation from /usr/local/bin/servo\033[0m"
		fi

		# Remove local binary if exists
		if [ -f "./servo" ]; then
			rm ./servo
			echo "\033[0;32m✅ Removed local binary ./servo\033[0m"
		fi
	fi

	echo "\033[0;32m✅ Servo uninstalled successfully!\033[0m"
	exit 0
fi

echo "\033[0;32m📦 Installing Servo...\033[0m"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture names
case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
esac

BINARY_NAME="servo-${OS}-${ARCH}"
if [ "$OS" = "linux" ]; then
    BINARY_NAME="servo"  # Use simple name for Linux
fi

# Check if binary exists in bin/ directory
if [ -f "bin/${BINARY_NAME}" ]; then
    echo "📦 Using pre-built binary..."
    cp "bin/${BINARY_NAME}" servo
    chmod +x servo
elif [ -f "servo" ]; then
    echo "📦 Using existing binary..."
else
    # Check if Go is available
    if command -v go &> /dev/null; then
        echo "🔨 Building from source (Go required)..."
        ./build.sh
    else
        echo "\033[0;31m❌ Error: No pre-built binary found and Go is not installed.\033[0m"
        echo ""
        echo "Please either:"
        echo "  1. Install Go: https://go.dev/dl/"
        echo "  2. Or download a pre-built binary from GitHub releases"
        echo ""
        exit 1
    fi
fi

if [ "$1" = "--global" ]; then
	sudo cp servo /usr/local/bin/servo
	echo
	echo "\033[0;32m✅ Servo installed globally! Run from anywhere with: servo\033[0m"
else
	echo "\033[0;32m✅ Servo ready! Run with: ./servo\033[0m"
	echo "   To install globally, run: ./install.sh --global"
fi

echo "   To uninstall, run: ./install.sh --uninstall"
