#!/bin/bash

# tools/servo/install.sh
# Unified installer/updater/removeer for Servo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' 

show_help() {
    echo "Servo Installer/Updater/removeer"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  install     Install Servo (default)"
    echo "  update      Update Servo to latest version"
    echo "  remove   Remove Servo"
    echo ""
    echo "Options:"
    echo "  --global    Install/update/remove globally (requires sudo)"
    echo "  --help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                    # Install locally"
    echo "  $0 install --global   # Install globally"
    echo "  $0 update             # Update local installation"
    echo "  $0 update --global    # Update global installation"
    echo "  $0 remove          # Remove local and global"
    echo "  $0 remove --global # Remove global only"
}

detect_platform() {
    local operating_system=$(uname -s | tr '[:upper:]' '[:lower:]')
    local processor_type=$(uname -m)
    
    case "$processor_type" in
        x86_64) processor_type="amd64" ;;
        aarch64|arm64) processor_type="arm64" ;;
    esac
    
    if [ "$operating_system" = "linux" ]; then
        echo "servo"
    else
        echo "servo-${operating_system}-${processor_type}"
    fi
}

find_prebuilt_binary() {
    local binary_name="$1"
    
    if [ -f "bin/${binary_name}" ]; then
        echo "bin/${binary_name}"
        return 0
    fi
    
    if [ -f "./servo" ]; then
        echo "./servo"
        return 0
    fi
    
    return 1
}

build_servo_from_source() {
    echo "🔨 Building from source (Go required)..."
    
    if ! command -v go &> /dev/null; then
        echo -e "${RED}❌ Error: Go is not installed.${NC}"
        echo ""
        echo "Please either:"
        echo "  1. Install Go: https://go.dev/dl/"
        echo "  2. Or download a pre-built binary from GitHub releases"
        echo ""
        return 1
    fi
    
    ./build-all.sh
    
    local operating_system=$(uname -s | tr '[:upper:]' '[:lower:]')
    local processor_type=$(uname -m)
    case "$processor_type" in
        x86_64) processor_type="amd64" ;;
        aarch64|arm64) processor_type="arm64" ;;
    esac
    
    local platform_binary=""
    if [ "$operating_system" = "linux" ]; then
        platform_binary="bin/servo-linux-${processor_type}"
    else
        platform_binary="bin/servo-${operating_system}-${processor_type}"
    fi
    
    if [ -f "$platform_binary" ]; then
        cp "$platform_binary" servo
        chmod +x servo
    fi
    
    return 0
}

prepare_binary() {
    local binary_name="$1"
    local binary_path=$(find_prebuilt_binary "$binary_name") || true
    
    if [ -z "$binary_path" ] || [ ! -f "$binary_path" ]; then
        echo "📦 No pre-built binary found. Building from source..."
        if ! build_servo_from_source; then
            exit 1
        fi
        echo "./servo"
        return 0
    fi
    
    if [ "$binary_path" != "./servo" ]; then
        echo "📦 Using pre-built binary from $binary_path..."
        cp "$binary_path" servo
        chmod +x servo
        echo "./servo"
        return 0
    fi
    
    echo "📦 Using existing binary..."
    echo "./servo"
}

install_servo() {
    local install_globally="$1"
    local binary_name=$(detect_platform)
    
    echo -e "${GREEN}📦 Installing Servo...${NC}"
    
    local binary_path=$(prepare_binary "$binary_name")
    
    if [ "$install_globally" = "true" ]; then
        echo "🔐 Installing to /usr/local/bin/servo (requires sudo)..."
        sudo cp servo /usr/local/bin/servo
        echo ""
        echo -e "${GREEN}✅ Servo installed globally! Run from anywhere with: servo${NC}"
    else
        echo -e "${GREEN}✅ Servo ready! Run with: ./servo${NC}"
        echo "   To install globally, run: $0 install --global"
    fi
    
    echo "   To update, run: $0 update"
    echo "   To remove, run: $0 remove"
}

update_servo() {
    local update_globally="$1"
    local binary_name=$(detect_platform)
    
    echo -e "${GREEN}🔄 Updating Servo...${NC}"
    
    local is_installed=false
    local installation_location=""
    
    if [ "$update_globally" = "true" ]; then
        if [ -f "/usr/local/bin/servo" ]; then
            is_installed=true
            installation_location="globally"
        fi
    else
        if [ -f "./servo" ]; then
            is_installed=true
            installation_location="locally"
        fi
    fi
    
    if [ "$is_installed" = "false" ]; then
        echo -e "${YELLOW} Servo is not installed in $installation_location. Installing instead...${NC}"
        install_servo "$update_globally"
        return $?
    fi
    
    local binary_path=$(prepare_binary "$binary_name")
    
    if [ "$update_globally" = "true" ]; then
        echo "🔐 Updating /usr/local/bin/servo (requires sudo)..."
        sudo cp servo /usr/local/bin/servo
        echo ""
        echo -e "${GREEN}✅ Servo updated globally!${NC}"
    else
        echo -e "${GREEN}✅ Servo updated locally!${NC}"
    fi
}

remove_servo() {
    local global_only="$1"
    
    echo -e "${RED}🗑️  Removing Servo...${NC}"
    
    local something_was_removed=false
    
    if [ -f "/usr/local/bin/servo" ]; then
        echo "🔐 Removing global installation (requires sudo)..."
        sudo rm /usr/local/bin/servo
        echo -e "${GREEN}✅ Removed global installation from /usr/local/bin/servo${NC}"
        something_was_removed=true
    elif [ "$global_only" = "true" ]; then
        echo -e "${YELLOW}⚠️  No global installation found${NC}"
    fi
    
    if [ "$global_only" != "true" ]; then
        if [ -f "./servo" ]; then
            rm ./servo
            echo -e "${GREEN}✅ Removed local binary ./servo${NC}"
            something_was_removed=true
        fi
    fi
    
    if [ "$something_was_removed" = "false" ] && [ "$global_only" != "true" ]; then
        echo -e "${YELLOW}⚠️  No installation found${NC}"
    elif [ "$something_was_removed" = "true" ]; then
        echo -e "${GREEN}✅ Servo removed successfully!${NC}"
    fi
}

command_to_run="${1:-install}"
install_globally="false"

if [ "$command_to_run" = "--help" ] || [ "$command_to_run" = "-h" ] || [ "$command_to_run" = "help" ]; then
    show_help
    exit 0
fi

# Handle --remove flag
if [ "$command_to_run" = "--remove" ]; then
    command_to_run="remove"
fi

if [ "$1" = "--global" ] || [ "$2" = "--global" ]; then
    install_globally="true"
    if [ "$1" = "--global" ]; then
        command_to_run="install"
    fi
fi

case "$command_to_run" in
    install)
        install_servo "$install_globally"
        ;;
    update)
        update_servo "$install_globally"
        ;;
    remove)
        if [ "$install_globally" = "true" ]; then
            remove_servo true
        else
            remove_servo false
        fi
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $command_to_run${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac