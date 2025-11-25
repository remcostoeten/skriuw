import { createFolder } from '../api/mutations/create-folder'
import { createNote } from '../api/mutations/create-note'
import { getItems } from '../api/queries/get-items'

import { markdownToBlocks } from './markdown-to-blocks'

import type { Folder, Note, Item } from '../types'
import type { Block } from '@blocknote/core'

/**
 * Default notes and folders to create for each visitor
 * These will be created if no items exist in storage
 */
export interface DefaultNote {
    name: string
    content?: Block[]
    parentFolderName?: string // Reference folder by name (will be resolved to ID)
}

export interface DefaultFolder {
    name: string
    parentFolderName?: string // Reference parent folder by name (will be resolved to ID)
}

/**
 * Define your default notes and folders here
 * They will be created automatically for each visitor if no items exist
 */
const DEFAULT_NOTES: DefaultNote[] = [
    {
        name: 'Welcome',
        content: [
            {
                id: '1',
                type: 'paragraph',
                props: {},
                content: [],
                children: []
            } as Block
        ]
    }
    // Add more default notes here
]

const DEFAULT_FOLDERS: DefaultFolder[] = [
    {
        name: 'Examples'
    }
    // Add more default folders here
]

/**
 * Find a folder by name in the item tree
 */
function findFolderByName(
    items: Item[],
    name: string,
    parentId?: string
): Folder | null {
    for (const item of items) {
        if (item.type === 'folder' && item.name === name) {
            const itemWithParent = item as Folder & { parentFolderId?: string }
            if (
                parentId === undefined ||
                itemWithParent.parentFolderId === parentId
            ) {
                return item as Folder
            }
        }
        if (item.type === 'folder' && item.children) {
            const found = findFolderByName(item.children, name, parentId)
            if (found) return found
        }
    }
    return null
}

/**
 * Find a note by name in the item tree
 */
function findNoteByName(
    items: Item[],
    name: string,
    parentId?: string
): Note | null {
    for (const item of items) {
        if (item.type === 'note' && item.name === name) {
            const itemWithParent = item as Note & { parentFolderId?: string }
            if (
                parentId === undefined ||
                itemWithParent.parentFolderId === parentId
            ) {
                return item as Note
            }
        }
        if (item.type === 'folder' && item.children) {
            const found = findNoteByName(item.children, name, parentId)
            if (found) return found
        }
    }
    return null
}

/**
 * Ensure the "To Do" folder structure exists
 * This creates the structure if it doesn't exist, making it available for everyone
 */
async function ensureToDoFolderStructure(): Promise<void> {
    try {
        const items = await getItems()

        // Find or create "To Do" folder
        let toDoFolder = findFolderByName(items, 'To Do')
        if (!toDoFolder) {
            toDoFolder = await createFolder({ name: 'To Do' })
            console.info('Created "To Do" folder')
        }

        // Find or create "servo" folder inside "To Do"
        const itemsAfterToDo = await getItems()
        let servoFolder = findFolderByName(
            itemsAfterToDo,
            'servo',
            toDoFolder.id
        )
        if (!servoFolder) {
            servoFolder = await createFolder({
                name: 'servo',
                parentFolderId: toDoFolder.id
            })
            console.info('Created "servo" folder inside "To Do"')
        }

        // Find or create "Install" note
        const itemsAfterServo = await getItems()
        const installNote = findNoteByName(
            itemsAfterServo,
            'Install',
            servoFolder.id
        )
        if (!installNote) {
            const installMarkdown = `# Servo Universal Installer

A one-command installer to add Servo to any Node.js project. Servo is a terminal-based development launcher that provides an interactive TUI for managing your development workflows.

## Quick Start

### Install in Current Project

\`\`\`bash
curl -sSL https://raw.githubusercontent.com/remco-stoeten/servo/main/tools/servo/install-servo.sh | bash
\`\`\`

### Install in Specific Project

\`\`\`bash
curl -sSL https://raw.githubusercontent.com/remco-stoeten/servo/main/tools/servo/install-servo.sh | bash -s /path/to/your/project
\`\`\`

### Install Globally

\`\`\`bash
curl -sSL https://raw.githubusercontent.com/remco-stoeten/servo/main/tools/servo/install-servo.sh | bash -s --global
\`\`\`

## Advanced Usage

### Download and Run Locally

\`\`\`bash
# Download the installer
wget https://raw.githubusercontent.com/remco-stoeten/servo/main/tools/servo/install-servo.sh
chmod +x install-servo.sh

# Install in current project
./install-servo.sh

# Install in specific project
./install-servo.sh /path/to/project

# Install globally
./install-servo.sh --global
\`\`\`

### Command Line Options

\`\`\`bash
./install-servo.sh [PATH] [OPTIONS]
\`\`\`

#### Options:

- \`--global\` - Install Servo globally to system PATH
- \`--local\` - Install Servo locally in project (default)
- \`--dev\` - Add Servo as devDependency in package.json
- \`--force\` - Force overwrite existing installation
- \`--skip-npm\` - Skip package.json modification
- \`--help, -h\` - Show help message

#### Examples:

\`\`\`bash
# Install with force overwrite
./install-servo.sh --force

# Install as devDependency
./install-servo.sh --dev

# Install without modifying package.json
./install-servo.sh --skip-npm

# Global installation
./install-servo.sh --global
\`\`\`

## What Gets Installed

### Local Installation

When you install Servo in a project, it creates:

\`\`\`
your-project/
├── tools/
│   └── servo/
│       ├── servo              # Main executable
│       ├── bin/               # Platform-specific binaries
│       ├── install.sh         # Servo's own installer
│       └── ...                # Servo components
├── scripts/
│   ├── dev.sh                 # Development wrapper script
│   └── kill-dev.sh            # Process killer script
└── package.json               # Updated with new scripts
\`\`\`

### New NPM Scripts

The installer adds these scripts to your \`package.json\`:

\`\`\`json
{
  "scripts": {
    "dev": "bash scripts/dev.sh",
    "dev:direct": "next dev",
    "dev:legacy": "next dev",
    "servo": "tools/servo/servo || tools/servo/bin/servo-linux-amd64",
    "kill:dev": "bash scripts/kill-dev.sh || pkill -f \\"next dev\\" || true"
  }
}
\`\`\`

## How It Works

### Smart Dev Script (\`scripts/dev.sh\`)

The \`dev.sh\` script is intelligent:

1. **Tries Servo first**: If Servo is available and you're in an interactive terminal, it launches Servo
2. **Falls back gracefully**: If no terminal or Servo missing, runs your original dev command
3. **Preserves original behavior**: Your \`npm run dev:direct\` always works as before

### Installation Process

1. **Project Validation**: Confirms it's a Node.js project (checks for \`package.json\`)
2. **Platform Detection**: Automatically detects your OS and architecture
3. **Download**: Clones Servo from the repository
4. **Setup**: Creates wrapper scripts and updates \`package.json\`
5. **Permissions**: Makes all scripts executable

## Usage After Installation

### Basic Usage

\`\`\`bash
cd your-project
npm run dev          # Launches Servo (if available)
npm run dev:direct   # Bypasses Servo, runs original dev command
npm run servo        # Runs Servo directly
\`\`\`

### Servo Features

- **Interactive Menu**: Choose which app/tool to run
- **Multi-Process Management**: Run multiple dev servers
- **Port Conflict Detection**: Warns about occupied ports
- **Process Dashboard**: View and manage running processes
- **Terminal UI**: Clean, responsive interface

### Troubleshooting

\`\`\`bash
# Kill all dev processes
npm run kill:dev

# Run without Servo
npm run dev:direct

# View Servo logs
ls -la tools/servo/.servo/
\`\`\`

## Global vs Local Installation

### Local Installation (Recommended)

- **Project-specific**: Each project gets its own Servo version
- **No system dependencies**: Doesn't require sudo or system access
- **Team consistency**: Same version for all developers
- **Easy to remove**: Just delete the \`tools/servo\` directory

### Global Installation

- **System-wide access**: Run \`servo\` from anywhere
- **Requires sudo**: Needs system administrator privileges
- **One version for all projects**: May not work with different Servo versions
- **Convenient for personal projects**: Quick access without project setup

## Project Types Supported

Servo works with any Node.js project that has:

- \`package.json\` file
- Development scripts in \`package.json.scripts\`
- Any of these frameworks (auto-detected):
  - Next.js
  - Vite
  - Create React App
  - Express
  - Nuxt.js
  - SvelteKit
  - And more...

### Monorepo Support

Servo automatically detects and works with:

- **pnpm workspaces**
- **npm workspaces**
- **yarn workspaces**
- **Lerna/Nx monorepos**
- **Custom workspace configurations**

## Removal

### Remove Local Installation

\`\`\`bash
# Remove Servo directory
rm -rf tools/servo

# Remove scripts
rm -f scripts/dev.sh scripts/kill-dev.sh

# Restore package.json (optional)
git checkout package.json
# or restore from backup if created
mv package.json.backup package.json
\`\`\`

### Remove Global Installation

\`\`\`bash
sudo rm /usr/local/bin/servo
\`\`\`

## Platform Support

### Supported Platforms

- **Linux**: x86_64 (amd64), ARM64 (arm64)
- **macOS**: Intel (amd64), Apple Silicon (arm64)
- **Windows**: x86_64 (amd64), ARM64 (arm64) - via WSL

### Requirements

- **Git**: For cloning the repository
- **Bash**: For running shell scripts
- **Node.js**: For target projects
- **Optional**: sudo for global installation

## Development

### Modifying the Installer

The installer is designed to be customizable:

1. **Download paths**: Change the repository URL
2. **Script templates**: Modify \`dev.sh\` and \`kill-dev.sh\` templates
3. **Package.json logic**: Adjust how scripts are added
4. **Installation paths**: Change where files are placed

### Testing

\`\`\`bash
# Test without installation (dry run)
./install-servo.sh --help

# Test in temporary directory
mkdir /tmp/test-project && cd /tmp/test-project
echo '{"name":"test","scripts":{"dev":"echo dev"}}' > package.json
/path/to/install-servo.sh .
\`\`\`

## Support

### Issues and Feature Requests

- GitHub Issues: https://github.com/remco-stoeten/servo/issues
- Discussions: https://github.com/remco-stoeten/servo/discussions

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with various project types
5. Submit a pull request

---

**Enjoy using Servo! 🚀**`

            const installBlocks = await markdownToBlocks(installMarkdown)
            await createNote({
                name: 'Install',
                content: installBlocks,
                parentFolderId: servoFolder.id
            })
            console.info('Created "Install" note in "servo" folder')
        }

        // Find or create "Local usage" note
        const itemsAfterInstall = await getItems()
        const localUsageNote = findNoteByName(
            itemsAfterInstall,
            'Local usage',
            servoFolder.id
        )
        if (!localUsageNote) {
            const localUsageMarkdown = `# Local Servo Installation Guide

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

**🎉 You now have a complete offline installation system for Servo!**`

            const localUsageBlocks = await markdownToBlocks(localUsageMarkdown)
            await createNote({
                name: 'Local usage',
                content: localUsageBlocks,
                parentFolderId: servoFolder.id
            })
            console.info('Created "Local usage" note in "servo" folder')
        }
    } catch (error) {
        console.error('Failed to ensure "To Do" folder structure:', error)
        // Don't throw - allow app to continue even if this fails
    }
}

/**
 * Initialize default notes and folders for a new visitor
 * Only creates defaults if no items exist in storage
 */
export async function initializeDefaultNotesAndFolders(): Promise<void> {
    try {
        const existingItems = await getItems()

        // Only initialize if no items exist (first visit)
        if (existingItems.length === 0) {
            console.info(
                'No items found, initializing default notes and folders...'
            )

            // Create folders first (they might be parents for notes)
            const folderMap = new Map<string, string>() // name -> id

            for (const folder of DEFAULT_FOLDERS) {
                // Resolve parent folder ID if parentFolderName is specified
                const parentFolderId = folder.parentFolderName
                    ? folderMap.get(folder.parentFolderName)
                    : undefined

                const createdFolder = await createFolder({
                    name: folder.name,
                    parentFolderId
                })
                folderMap.set(folder.name, createdFolder.id)
            }

            // Create notes
            for (const note of DEFAULT_NOTES) {
                // Resolve parent folder ID if parentFolderName is specified
                const parentFolderId = note.parentFolderName
                    ? folderMap.get(note.parentFolderName)
                    : undefined

                await createNote({
                    name: note.name,
                    content: note.content,
                    parentFolderId
                })
            }

            console.info(
                `Initialized ${DEFAULT_FOLDERS.length} folders and ${DEFAULT_NOTES.length} notes`
            )
        } else {
            console.info(
                `Found ${existingItems.length} existing items, skipping default initialization`
            )
        }

        // Always ensure the "To Do" folder structure exists
        await ensureToDoFolderStructure()
    } catch (error) {
        console.error('Failed to initialize default notes and folders:', error)
        // Don't throw - allow app to continue even if defaults fail
    }
}
