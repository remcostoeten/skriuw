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

./build.sh

if [ "$1" = "--global" ]; then
	sudo cp servo /usr/local/bin/servo
	echo
	echo "\033[0;32m✅ Servo installed globally! Run from anywhere with: servo\033[0m"
else
	echo "\033[0;32m✅ Servo built! Run with: ./servo\033[0m"
	echo "   To install globally, run: ./install.sh --global"
fi

echo "   To uninstall, run: ./install.sh --uninstall"
