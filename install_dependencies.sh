#!/usr/bin/env bash
set -euo pipefail
echo 'Installing Turso DB Creator CLI dependencies...'
curl -sSfL https://get.tur.so/install.sh | bash
pip install pyperclip rich
sudo apt-get update
sudo apt-get install -y xclip xsel wl-clipboard || true
echo 'Dependencies installed successfully!'
