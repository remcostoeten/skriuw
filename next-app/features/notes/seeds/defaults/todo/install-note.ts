import type { DefaultNote } from '@/features/notes/utils/initialize-defaults'

export const installNoteSeed = {
	name: 'Install',
	parentFolderName: 'servo',
	contentMarkdown: `# Servo Universal Installer

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

**Enjoy using Servo! 🚀**`,
} satisfies DefaultNote
