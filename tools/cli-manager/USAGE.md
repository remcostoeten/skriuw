# CLI Manager - Quick Usage Guide

## Starting the CLI

From project root:

```bash
# Option 1: Using bun
bun run cli
# or
bun run sk

# Option 2: Using the shell script
./sk

# Option 3: From cli-manager directory
cd tools/cli-manager
bun run dev
```

## Main Menu Navigation

Use arrow keys (↑/↓) to navigate and Enter to select.

### Menu Sections

#### Development
- **Run [App Name]** - Start a single app in development mode
- **Run All Apps** - Start all configured apps simultaneously
- **Manage Running Apps** - Control and monitor active processes

#### Build
- **Build [App Name]** - Build a single app for production
- **Build All Apps** - Build all apps with a summary report

#### Deploy
- **Deploy to Staging** - Deploy to Vercel preview environment
- **Deploy to Production** - Deploy to Vercel production

#### Utilities
- **Open Repository** - Opens your GitHub repo in browser
- **Manage Running Apps** - Interactive process management

## Managing Running Apps

When you select "Manage Running Apps", you can:

1. Select an app from the list of running processes
2. Choose an action:
   - **O - Open in Browser** - Opens `http://localhost:[port]`
   - **C - Open in Code** - Opens the app directory in your editor
   - **R - Restart** - Stops and starts the app
   - **S - Stop** - Terminates the app process
   - **I - Install Package** - Add dependencies without stopping

## Process Output

The CLI filters and suppresses verbose output from Next.js and other frameworks, showing only:
- Clean startup messages
- App status with port and URL
- Error messages (if any)
- Build summaries

## Examples

### Starting the Tauri App

1. Run `bun run cli`
2. Select "Run Tauri App"
3. Wait for "Ready" message
4. App is now running at http://localhost:42069

### Building All Apps

1. Run `bun run cli`
2. Select "Build All Apps"
3. Watch progress for each app
4. Review the summary report with timing and status

### Installing a Package

1. Run `bun run cli`
2. Select "Manage Running Apps"
3. Choose the app you want to add packages to
4. Select "I - Install Package"
5. Enter package name (e.g., "lodash")
6. Package installs without stopping the dev server

### Quick Deploy

1. Run `bun run cli`
2. Select "Deploy to Production"
3. Vercel CLI runs and deploys
4. Review deployment URL

## Keyboard Shortcuts

While apps are running (in manage mode):
- `O` - Open in browser
- `C` - Open in code editor
- `R` - Restart app
- `S` - Stop app
- `I` - Install package
- `M` - Return to main menu

## Tips

1. **Multiple Apps**: You can run all apps at once with "Run All Apps"
2. **Clean Logs**: The CLI filters out noisy framework logs for clarity
3. **Safe Cleanup**: Press Ctrl+C anytime to gracefully shut down all apps
4. **Fast Navigation**: Use arrow keys for quick menu navigation
5. **Persistent Processes**: Apps continue running while you navigate menus

## Customization

Edit `tools/cli-manager/src/config.ts` to:
- Add/remove apps
- Change ports
- Customize build commands
- Set your preferred editor
- Modify the ASCII logo
- Configure deployment commands

## Troubleshooting

### "App not starting"
- Check port availability: `lsof -i :[port]`
- Verify the app path in config.ts
- Ensure dependencies are installed

### "Command not found"
- Make sure bun is installed: `bun --version`
- Check you're in project root
- Verify package.json scripts are correct

### "Build failed"
- Review the error output
- Check app-specific build requirements
- Verify all dependencies are installed

### "Hotkeys not working"
- Ensure your terminal supports TTY raw mode
- Try running outside tmux/screen
- Check terminal emulator compatibility

## Support

For issues or feature requests:
1. Check the [README.md](README.md)
2. Review configuration in `src/config.ts`
3. Examine process logs
4. Create an issue in the repository

