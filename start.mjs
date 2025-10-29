#!/usr/bin/env node

import { spawn, exec } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import { readFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Track running processes
const runningProcesses = {
  tursoWeb: null,
  tursoTauri: null,
  instantdbWeb: null,
  instantdbTauri: null,
};

// Get last modified date of apps
function getLastUpdated(appPath) {
  try {
    const stats = statSync(join(__dirname, appPath));
    return new Date(stats.mtime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

// Welcome banner
function showWelcome() {
  console.clear();
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║') + chalk.bold.white('  🚀 Tauri Local-First Monorepo Manager  ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════╝\n'));
  console.log(chalk.gray('  Navigate with arrow keys, type numbers, or search\n'));
}

// Kill a process and its children
function killProcess(proc) {
  if (proc && !proc.killed) {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch (e) {
      proc.kill();
    }
  }
}

// Start web dev server
async function startWeb(app) {
  const appName = app === 'turso' ? 'Turso' : 'InstantDB';
  const port = app === 'turso' ? 5173 : 3000;
  const key = app === 'turso' ? 'tursoWeb' : 'instantdbWeb';

  if (runningProcesses[key]) {
    console.log(chalk.yellow(`\n⚠️  ${appName} web server is already running!`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
    return;
  }

  const spinner = ora(`Starting ${appName} web server...`).start();

  const proc = spawn('pnpm', ['--filter', `${app}-app`, 'dev'], {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runningProcesses[key] = proc;

  let serverReady = false;

  proc.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Local:') || output.includes('localhost') || output.includes('ready')) {
      if (!serverReady) {
        serverReady = true;
        spinner.succeed(chalk.green(`${appName} web server started!`));
        console.log(chalk.cyan(`\n  🌐 Web: http://localhost:${port}`));
        console.log(chalk.gray(`  📝 Logs streaming...\n`));
      }
    }
    if (serverReady) {
      console.log(chalk.gray(`  [web] ${output.trim()}`));
    }
  });

  proc.stderr.on('data', (data) => {
    if (serverReady) {
      console.log(chalk.red(`  [web] ${data.toString().trim()}`));
    }
  });

  proc.on('exit', (code) => {
    runningProcesses[key] = null;
    if (code !== 0 && code !== null) {
      console.log(chalk.red(`\n❌ ${appName} web server exited with code ${code}`));
    }
  });

  // Wait for server to be ready
  await new Promise((resolve) => {
    const checkReady = setInterval(() => {
      if (serverReady) {
        clearInterval(checkReady);
        resolve();
      }
    }, 100);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkReady);
      if (!serverReady) {
        spinner.warn(chalk.yellow('Server started but may not be ready yet'));
      }
      resolve();
    }, 30000);
  });

  await showRunningMenu(app, 'web');
}

// Start Tauri desktop app
async function startTauri(app) {
  const appName = app === 'turso' ? 'Turso' : 'InstantDB';
  const key = app === 'turso' ? 'tursoTauri' : 'instantdbTauri';

  if (runningProcesses[key]) {
    console.log(chalk.yellow(`\n⚠️  ${appName} Tauri app is already running!`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
    return;
  }

  const spinner = ora(`Starting ${appName} Tauri app...`).start();

  const proc = spawn('pnpm', ['--filter', `${app}-app`, 'tauri', 'dev'], {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runningProcesses[key] = proc;

  let appReady = false;

  proc.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Running') || output.includes('Finished')) {
      if (!appReady) {
        appReady = true;
        spinner.succeed(chalk.green(`${appName} Tauri app started!`));
        console.log(chalk.cyan(`\n  🖥️  Desktop app is running`));
        console.log(chalk.gray(`  📝 Logs streaming...\n`));
      }
    }
    if (appReady) {
      console.log(chalk.gray(`  [tauri] ${output.trim()}`));
    }
  });

  proc.stderr.on('data', (data) => {
    if (appReady) {
      console.log(chalk.red(`  [tauri] ${data.toString().trim()}`));
    }
  });

  proc.on('exit', (code) => {
    runningProcesses[key] = null;
    if (code !== 0 && code !== null) {
      console.log(chalk.red(`\n❌ ${appName} Tauri app exited with code ${code}`));
    }
  });

  // Wait a bit for app to start
  await new Promise((resolve) => setTimeout(resolve, 3000));
  if (!appReady) {
    spinner.succeed(chalk.green(`${appName} Tauri app starting...`));
  }

  await showRunningMenu(app, 'tauri');
}

// Build app
async function buildApp(app) {
  const appName = app === 'turso' ? 'Turso' : 'InstantDB';
  const spinner = ora(`Building ${appName} app...`).start();

  return new Promise((resolve) => {
    const proc = spawn('pnpm', ['--filter', `${app}-app`, 'build'], {
      cwd: __dirname,
      stdio: 'inherit',
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        spinner.succeed(chalk.green(`${appName} app built successfully!`));
      } else {
        spinner.fail(chalk.red(`${appName} app build failed!`));
      }
      resolve();
    });
  });
}

// Build Tauri app
async function buildTauri(app) {
  const appName = app === 'turso' ? 'Turso' : 'InstantDB';
  const spinner = ora(`Building ${appName} Tauri app...`).start();

  return new Promise((resolve) => {
    const proc = spawn('pnpm', ['--filter', `${app}-app`, 'tauri', 'build'], {
      cwd: __dirname,
      stdio: 'inherit',
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        spinner.succeed(chalk.green(`${appName} Tauri app built successfully!`));
      } else {
        spinner.fail(chalk.red(`${appName} Tauri app build failed!`));
      }
      resolve();
    });
  });
}

// Show menu when app is running
async function showRunningMenu(app, type) {
  const appName = app === 'turso' ? 'Turso' : 'InstantDB';
  const port = app === 'turso' ? 5173 : 3000;

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `${appName} ${type === 'web' ? 'Web' : 'Tauri'} is running. What would you like to do?`,
      choices: [
        ...(type === 'web'
          ? [{ name: '🌐 Open in browser', value: 'open' }]
          : []),
        { name: '📊 View live logs (streaming above)', value: 'logs' },
        { name: '🔄 Restart', value: 'restart' },
        { name: '⏹️  Stop', value: 'stop' },
        new inquirer.Separator(),
        { name: '← Back to main menu', value: 'back' },
      ],
    },
  ]);

  const key = type === 'web' ? `${app}Web` : `${app}Tauri`;

  switch (action) {
    case 'open':
      await open(`http://localhost:${port}`);
      await showRunningMenu(app, type);
      break;
    case 'logs':
      console.log(chalk.cyan('\n📝 Logs are streaming above. Press Ctrl+C to stop or continue watching...\n'));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showRunningMenu(app, type);
      break;
    case 'restart':
      console.log(chalk.yellow('\n🔄 Restarting...'));
      killProcess(runningProcesses[key]);
      runningProcesses[key] = null;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (type === 'web') {
        await startWeb(app);
      } else {
        await startTauri(app);
      }
      break;
    case 'stop':
      console.log(chalk.yellow(`\n⏹️  Stopping ${appName} ${type}...`));
      killProcess(runningProcesses[key]);
      runningProcesses[key] = null;
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log(chalk.green('✓ Stopped\n'));
      break;
    case 'back':
      break;
  }
}

// App submenu
async function showAppMenu(app) {
  const appName = app === 'turso' ? 'Turso' : 'InstantDB';
  const lastUpdated = getLastUpdated(`apps/${app}`);

  console.clear();
  showWelcome();
  console.log(chalk.bold.white(`  ${appName} App`) + chalk.gray(` (Last updated: ${lastUpdated})\n`));

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'What would you like to do?',
      choices: [
        { name: '▶️  Start web dev server', value: 'web' },
        { name: '🖥️  Start Tauri desktop app', value: 'tauri' },
        new inquirer.Separator(),
        { name: '📦 Build web app', value: 'build-web' },
        { name: '📦 Build Tauri app', value: 'build-tauri' },
        new inquirer.Separator(),
        { name: '← Back to main menu', value: 'back' },
      ],
    },
  ]);

  switch (choice) {
    case 'web':
      await startWeb(app);
      await showAppMenu(app);
      break;
    case 'tauri':
      await startTauri(app);
      await showAppMenu(app);
      break;
    case 'build-web':
      await buildApp(app);
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showAppMenu(app);
      break;
    case 'build-tauri':
      await buildTauri(app);
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showAppMenu(app);
      break;
    case 'back':
      break;
  }
}

// Start all apps
async function startAll() {
  console.log(chalk.cyan('\n🚀 Starting all apps...\n'));

  const spinner1 = ora('Starting Turso web...').start();
  await new Promise((resolve) => {
    const proc = spawn('pnpm', ['--filter', 'turso-app', 'dev'], {
      cwd: __dirname,
      detached: true,
      stdio: 'ignore',
    });
    runningProcesses.tursoWeb = proc;
    setTimeout(() => {
      spinner1.succeed('Turso web started');
      resolve();
    }, 2000);
  });

  const spinner2 = ora('Starting InstantDB web...').start();
  await new Promise((resolve) => {
    const proc = spawn('pnpm', ['--filter', 'instantdb-app', 'dev'], {
      cwd: __dirname,
      detached: true,
      stdio: 'ignore',
    });
    runningProcesses.instantdbWeb = proc;
    setTimeout(() => {
      spinner2.succeed('InstantDB web started');
      resolve();
    }, 2000);
  });

  console.log(chalk.green('\n✅ All apps started!'));
  console.log(chalk.cyan('  🌐 Turso: http://localhost:5173'));
  console.log(chalk.cyan('  🌐 InstantDB: http://localhost:3000\n'));

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
}

// Build all apps
async function buildAll() {
  console.log(chalk.cyan('\n📦 Building all apps...\n'));

  await buildApp('turso');
  await buildApp('instantdb');

  console.log(chalk.green('\n✅ All apps built!\n'));
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
}

// Show help
function showHelp() {
  console.clear();
  showWelcome();
  console.log(chalk.bold.white('  📚 Help\n'));
  console.log(chalk.white('  Navigation:'));
  console.log(chalk.gray('    • Use arrow keys to navigate'));
  console.log(chalk.gray('    • Type numbers (1, 2, 3...) to select'));
  console.log(chalk.gray('    • Type to fuzzy search options'));
  console.log(chalk.gray('    • Press Enter to confirm\n'));

  console.log(chalk.white('  App Structure:'));
  console.log(chalk.gray('    • apps/turso     - Tauri + React + Turso + Drizzle'));
  console.log(chalk.gray('    • apps/instantdb - Tauri + Next.js + InstantDB\n'));

  console.log(chalk.white('  Ports:'));
  console.log(chalk.gray('    • Turso web:     http://localhost:5173'));
  console.log(chalk.gray('    • InstantDB web: http://localhost:3000\n'));

  console.log(chalk.white('  Commands:'));
  console.log(chalk.gray('    • ./start        - Launch this menu'));
  console.log(chalk.gray('    • pnpm dev:*     - Start dev servers directly'));
  console.log(chalk.gray('    • pnpm build:*   - Build apps directly\n'));
}

// Main menu
async function showMainMenu() {
  console.clear();
  showWelcome();

  const tursoUpdated = getLastUpdated('apps/turso');
  const instantdbUpdated = getLastUpdated('apps/instantdb');

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'What would you like to do?',
      choices: [
        {
          name: `1️⃣  Turso App ${chalk.gray(`(Updated: ${tursoUpdated})`)}`,
          value: 'turso',
        },
        {
          name: `2️⃣  InstantDB App ${chalk.gray(`(Updated: ${instantdbUpdated})`)}`,
          value: 'instantdb',
        },
        new inquirer.Separator(),
        { name: '🚀 Start all apps', value: 'start-all' },
        { name: '📦 Build all apps', value: 'build-all' },
        new inquirer.Separator(),
        { name: '📚 Help', value: 'help' },
        { name: '👋 Exit', value: 'exit' },
      ],
    },
  ]);

  switch (choice) {
    case 'turso':
      await showAppMenu('turso');
      await showMainMenu();
      break;
    case 'instantdb':
      await showAppMenu('instantdb');
      await showMainMenu();
      break;
    case 'start-all':
      await startAll();
      await showMainMenu();
      break;
    case 'build-all':
      await buildAll();
      await showMainMenu();
      break;
    case 'help':
      showHelp();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showMainMenu();
      break;
    case 'exit':
      console.log(chalk.cyan('\n👋 Goodbye!\n'));
      process.exit(0);
  }
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n⏹️  Stopping all processes...'));
  Object.values(runningProcesses).forEach(killProcess);
  console.log(chalk.green('✓ Cleanup complete\n'));
  process.exit(0);
});

process.on('exit', () => {
  Object.values(runningProcesses).forEach(killProcess);
});

// Start the CLI
showMainMenu();

