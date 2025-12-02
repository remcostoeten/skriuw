import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const localUsageNoteSeed = {
	name: 'Local usage',
	parentFolderName: 'servo',
	contentMarkdown: `# Local Servo Installation Guide

**No git required!** Install Servo using your local files without pushing to a repository.

## Quick Start

### From the Servo Directory

\`\`\`bash
# Install Servo in the current project (where you're working)
./tools/servo/install-servo.sh --source ./tools/servo

# Install in a different project
./tools/servo/install-servo.sh --source ./tools/servo /path/to/other/project
\`\`\`

### From Anywhere

\`\`\`bash
# Install Servo from local directory to current project
/path/to/skriuw/tools/servo/install-servo.sh --source /path/to/skriuw/tools/servo

# With options
/path/to/skriuw/tools/servo/install-servo.sh \\
  --source /path/to/skriuw/tools/servo \\
  /path/to/target/project \\
  --force \\
  --dev
\`\`\`

## Installation Scenarios

### 1. Current Project Development

You're working on Servo and want to test it in your current project:

\`\`\`bash
cd /path/to/your/nodejs-project
/path/to/servo/install-servo.sh --source /path/to/servo
\`\`\`

### 2. Multiple Projects

Install your local Servo version into multiple projects:

\`\`\`bash
# Project 1
/path/to/servo/install-servo.sh --source /path/to/servo ~/projects/project1

# Project 2
/path/to/servo/install-servo.sh --source /path/to/servo ~/projects/project2

# Project 3
/path/to/servo/install-servo.sh --source /path/to/servo ~/projects/project3
\`\`\`

### 3. Testing Changes

Made changes to Servo and want to test them:

\`\`\`bash
# 1. Make your changes to Servo
cd /path/to/servo
# ... edit files ...

# 2. Reinstall in test project with force
./install-servo.sh --source . /path/to/test/project --force

# 3. Test the changes
cd /path/to/test/project
npm run dev
\`\`\`

## What Happens During Installation

### Local Source Detection

The installer validates your Servo source directory:

\`\`\`bash
✓ Directory exists
✓ Contains install.sh, bin/, or internal/ subdirectory
✓ Copies all files recursively
✓ Makes binaries executable
\`\`\`

### Files Created in Target Project

\`\`\`
your-project/
├── tools/
│   └── servo/              # ← Your local Servo files copied here
│       ├── servo           # Main executable
│       ├── bin/            # Platform binaries
│       ├── internal/       # Your modified code
│       ├── install-servo.sh # Installer script
│       └── ...             # All your changes
├── scripts/
│   ├── dev.sh              # Development wrapper
│   └── kill-dev.sh         # Process killer
└── package.json            # Updated with new scripts
\`\`\`

## Command Options for Local Installation

\`\`\`bash
./install-servo.sh --source /path/to/servo [OPTIONS] [TARGET_PATH]
\`\`\`

### Examples:

\`\`\`bash
# Basic local installation
./install-servo.sh --source ./tools/servo

# Install with force overwrite
./install-servo.sh --source ./tools/servo --force

# Install as devDependency
./install-servo.sh --source ./tools/servo --dev

# Install without modifying package.json
./install-servo.sh --source ./tools/servo --skip-npm

# Install in specific project
./install-servo.sh --source ./tools/servo /path/to/project

# Combine options
./install-servo.sh --source ./tools/servo /path/to/project --force --dev
\`\`\`

## Benefits of Local Installation

### ✅ **No Internet Required**

- Works offline
- No git cloning needed
- No network dependencies

### ✅ **Use Your Local Changes**

- Test modifications immediately
- No need to commit/push first
- Rapid development cycle

### ✅ **Version Control**

- Different projects can have different Servo versions
- Rollback easily by reinstalling old version
- Branch-specific installations

### ✅ **Fast Installation**

- No download time
- No git operations
- Instant file copying

## Workflow Example

### Development Cycle

\`\`\`bash
# 1. Make changes to Servo
cd /workspace/servo/tools/servo
vim internal/app/view.go  # Make responsive UI changes

# 2. Test in current project
./install-servo.sh --source . /workspace/my-app --force
cd /workspace/my-app
npm run dev  # Test your changes

# 3. Iterate
cd /workspace/servo/tools/servo
# Make more changes...
./install-servo.sh --source . /workspace/my-app --force
cd /workspace/my-app
npm run dev  # Test again
\`\`\`

### Multi-Project Testing

\`\`\`bash
# Create test setup
mkdir -p /tmp/{app1,app2,app3}
for dir in /tmp/app{1,2,3}; do
  echo '{"name":"test","scripts":{"dev":"echo dev"}}' > "$dir/package.json"
done

# Install your Servo version in all test projects
./install-servo.sh --source . /tmp/app1 --force
./install-servo.sh --source . /tmp/app2 --force
./install-servo.sh --source . /tmp/app3 --force
\`\`\`

## Troubleshooting

### Common Issues

#### "Source directory not found"

\`\`\`bash
# Check the path exists
ls -la /path/to/your/servo

# Use absolute path
./install-servo.sh --source $(pwd)/tools/servo
\`\`\`

#### "Doesn't appear to be a Servo installation"

\`\`\`bash
# Check directory structure
ls -la /path/to/servo/
# Should contain: install.sh, bin/, or internal/

# If directory is incomplete, ensure you're pointing to the right location
\`\`\`

#### "Permission denied"

\`\`\`bash
# Ensure script is executable
chmod +x install-servo.sh

# Check write permissions on target directory
ls -la /path/to/target/project
\`\`\`

### Validation Commands

\`\`\`bash
# Test installation without installing
./install-servo.sh --help

# Check what would be copied
ls -la /path/to/servo/
find /path/to/servo/ -name "*.go" | head -5
find /path/to/servo/ -name "servo*" | head -5
\`\`\`

## Comparison: Local vs Remote Installation

| Feature | Local (\`--source\`) | Remote (Default) |
|---------|-------------------|------------------|
| **Internet Required** | ❌ No | ✅ Yes |
| **Git Required** | ❌ No | ✅ Yes |
| **Speed** | ⚡ Instant | 🐢 Download + Clone |
| **Local Changes** | ✅ Yes | ❌ No |
| **Version** | Your local version | Latest from repo |
| **Offline Use** | ✅ Yes | ❌ No |

## Advanced Usage

### Script for Batch Installation

\`\`\`bash
#!/bin/bash
# install-to-all-projects.sh

SERVO_SOURCE="/path/to/servo/tools/servo"
PROJECTS=(
  "/path/to/project1"
  "/path/to/project2"
  "/path/to/project3"
)

for project in "\${PROJECTS[@]}"; do
  if [[ -d "$project" && -f "$project/package.json" ]]; then
    echo "Installing in: $project"
    ./install-servo.sh --source "$SERVO_SOURCE" "$project" --force
  else
    echo "Skipping: $project (not a Node.js project)"
  fi
done
\`\`\`

### Development Alias

\`\`\`bash
# Add to ~/.bashrc or ~/.zshrc
alias servo-install='f() { ./install-servo.sh --source /path/to/servo "$@"; }; f'
\`\`\`

Then use it anywhere:

\`\`\`bash
servo-install                    # Install in current project
servo-install /path/to/project   # Install in specific project
servo-install --force            # Force overwrite
\`\`\`

---

**🎉 You now have a complete offline installation system for Servo!**`,
} satisfies DefaultNote
