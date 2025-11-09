#!/usr/bin/env node

import chalk from 'chalk';
import { spawn } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import inquirer from 'inquirer';
import open from 'open';
import ora from 'ora';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Track running processes with metadata
const runningProcesses = {
  web: null,
  tauri: null,
};

// Track process metadata (logs, status, etc.)
const processMetadata = {
  web: { type: 'web', app: 'web', status: 'stopped', logs: [], port: 3000 },
  tauri: { type: 'tauri', app: 'web', status: 'stopped', logs: [] },
};

// Track build processes
const buildProcesses = {
  web: null,
  tauri: null,
};

const buildMetadata = {
  web: { type: 'build-web', app: 'web', status: 'stopped', logs: [] },
  tauri: { type: 'build-tauri', app: 'web', status: 'stopped', logs: [] },
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

// Resolve bundle directory and latest AppImage for an app
function getBundleDir() {
  return join(__dirname, `src-tauri/target/release/bundle/appimage`);
}

function getLatestDesktopBundle(app) {
  const dir = getBundleDir(app);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.appimage'))
    .map((f) => ({
      name: f,
      full: join(dir, f),
      mtime: statSync(join(dir, f)).mtimeMs,
    }));
  if (files.length === 0) return null;
  files.sort((a, b) => b.mtime - a.mtime);
  const latest = files[0];
  // Try to extract version from filename: "Name_0.1.0_amd64.AppImage"
  const match = latest.name.match(/_(\d+\.\d+\.\d+)_/);
  const version = match ? match[1] : 'unknown';
  return { path: latest.full, name: latest.name, version };
}

async function startDesktopBundle() {
  const appName = 'Skriuw';
  const latest = getLatestDesktopBundle();
  if (!latest) {
    console.log(
      chalk.yellow(`\n⚠️  No desktop build found for ${appName}. Build it first from the menu.`)
    );
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to continue' }]);
    return;
  }
  console.log(
    chalk.cyan(
      `\nLaunching ${appName} desktop (v${latest.version}) → ${latest.path}\n`
    )
  );
  const proc = spawn(latest.path, {
    cwd: __dirname,
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
  await inquirer.prompt([{ type: 'input', name: 'c', message: 'App launched. Press Enter to continue' }]);
}

// Welcome banner
function showWelcome() {
  console.clear();
  console.log(chalk.bold.cyan('\n╔════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║') + chalk.bold.white('  Tauri Local-First Monorepo Manager      ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════╝\n'));
  console.log(chalk.gray('  Navigate by pressing numbers. Backspace = go back.\n'));
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

// Get list of running tasks
function getRunningTasks() {
  const tasks = [];

  // Check dev processes
  for (const [key, proc] of Object.entries(runningProcesses)) {
    if (proc && !proc.killed) {
      const meta = processMetadata[key];
      if (meta.status !== 'stopped') {
        tasks.push({
          key,
          label: `${meta.app === 'turso' ? 'Turso' : 'Skriuw'} ${meta.type === 'web' ? 'Web' : 'Tauri'} (${meta.status})`,
          value: `task-${key}`,
          ...meta,
        });
      }
    }
  }

  // Check build processes
  for (const [key, proc] of Object.entries(buildProcesses)) {
    if (proc && !proc.killed) {
      const meta = buildMetadata[key];
      if (meta.status !== 'stopped' && meta.status !== 'completed' && meta.status !== 'failed') {
        tasks.push({
          key,
          label: `${meta.app === 'turso' ? 'Turso' : 'Skriuw'} ${meta.type === 'build-web' ? 'Web Build' : 'Tauri Build'} (${meta.status})`,
          value: `build-${key}`,
          isBuild: true,
          ...meta,
        });
      }
    }
  }

  return tasks;
}

// Start web dev server (non-blocking)
async function startWeb() {
  const appName = 'Skriuw';
  const port = 3000;
  const key = 'web';

  if (runningProcesses[key] && !runningProcesses[key].killed) {
    console.log(chalk.yellow(`\n⚠️  ${appName} web server is already running.`));
    return;
  }

  const meta = processMetadata[key];
  meta.status = 'starting';
  meta.logs = [];

  console.log(chalk.cyan(`\n🚀 Starting ${appName} web server in background...\n`));

  const proc = spawn('npm', ['run', 'dev'], {
    cwd: __dirname,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runningProcesses[key] = proc;
  meta.status = 'running';

  proc.stdout.on('data', (data) => {
    const output = data.toString();
    const lines = output.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      meta.logs.push({ timestamp: Date.now(), type: 'stdout', message: line });
      // Keep only last 500 log lines
      if (meta.logs.length > 500) {
        meta.logs.shift();
      }
    });

    if (output.includes('Local:') || output.includes('localhost') || output.includes('ready')) {
      if (meta.status === 'starting') {
        meta.status = 'ready';
        meta.ready = true;
      }
    }
  });

  proc.stderr.on('data', (data) => {
    const output = data.toString();
    const lines = output.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      meta.logs.push({ timestamp: Date.now(), type: 'stderr', message: line });
      if (meta.logs.length > 500) {
        meta.logs.shift();
      }
    });
  });

  proc.on('exit', (code) => {
    runningProcesses[key] = null;
    meta.status = 'stopped';
    meta.ready = false;
    if (code !== 0 && code !== null) {
      meta.status = 'failed';
    }
  });

  // Return immediately without blocking
  return;
}

// Start Tauri desktop app
async function startTauri() {
  const appName = 'Skriuw';
  const key = 'tauri';

  if (runningProcesses[key]) {
    console.log(chalk.yellow(`\nWarning: ${appName} Tauri app is already running.`));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
    return;
  }

  const spinner = ora(`Starting ${appName} Tauri app...`).start();

  const proc = spawn('npm', ['run', 'tauri:dev'], {
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
        console.log(chalk.cyan(`\n  Desktop app is running`));
        console.log(chalk.gray(`  Logs streaming...\n`));
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
      console.log(chalk.red(`\nError: ${appName} Tauri app exited with code ${code}`));
    }
  });

  // Wait a bit for app to start
  await new Promise((resolve) => setTimeout(resolve, 3000));
  if (!appReady) {
    spinner.succeed(chalk.green(`${appName} Tauri app starting...`));
  }

  await showRunningMenu('tauri');
}

// Build app
async function buildApp() {
  const appName = 'Skriuw';
  const spinner = ora(`Building ${appName} app...`).start();

  return new Promise((resolve) => {
    const proc = spawn('npm', ['run', 'build'], {
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
async function buildTauri() {
  const appName = 'Skriuw';
  const spinner = ora(`Building ${appName} Tauri app...`).start();

  return new Promise((resolve) => {
    const proc = spawn('npm', ['run', 'tauri:build'], {
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
async function showRunningMenu(type) {
  const appName = 'Skriuw';
  const port = 3000;

  const key = type === 'web' ? 'web' : 'tauri';

  const action = await numericMenu(
    `${appName} ${type === 'web' ? 'Web' : 'Tauri'} is running`,
    [
      {
        label: 'Actions',
        items: [
          ...(type === 'web' ? [{ name: 'Open in browser', value: 'open' }] : []),
          { name: 'View live logs (streaming above)', value: 'logs' },
          { name: 'Restart', value: 'restart' },
          { name: 'Stop', value: 'stop' },
        ],
      },
    ],
    true
  );

  switch (action) {
    case 'open':
      await open(`http://localhost:${port}`);
      await showRunningMenu(type);
      break;
    case 'logs':
      console.log(chalk.cyan('\nLogs are streaming above. Press Ctrl+C to stop or continue watching...\n'));
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showRunningMenu(app, type);
      break;
    case 'restart':
      console.log(chalk.yellow('\nRestarting...'));
      killProcess(runningProcesses[key]);
      runningProcesses[key] = null;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (type === 'web') {
        await startWeb();
      } else {
        await startTauri();
      }
      break;
    case 'stop':
      console.log(chalk.yellow(`\nStopping ${appName} ${type}...`));
      killProcess(runningProcesses[key]);
      runningProcesses[key] = null;
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log(chalk.green('Stopped.\n'));
      break;
    case 'back':
      break;
  }
}

// App submenu
async function showAppMenu() {
  const appName = 'Skriuw';
  const lastUpdated = getLastUpdated(`.`);
  const latest = getLatestDesktopBundle();

  console.clear();
  showWelcome();
  console.log(chalk.bold.white(`  ${appName} App`) + chalk.gray(` (Last updated: ${lastUpdated})\n`));

  const choice = await numericMenu(
    'Choose an action',
    [
      {
        label: 'Run',
        items: [
          { name: 'Start web dev server', value: 'web' },
          { name: 'Start Tauri desktop app (dev)', value: 'tauri' },
        ],
      },
      {
        label: 'Desktop',
        items: [
          latest
            ? { name: `Start latest desktop build (v${latest.version})`, value: 'desktop-bundle' }
            : { name: 'Start latest desktop build (no build found)', value: 'desktop-missing', disabled: true },
        ],
      },
      {
        label: 'Build',
        items: [
          { name: 'Build web app', value: 'build-web' },
          { name: 'Build Tauri app', value: 'build-tauri' },
        ],
      },
    ],
    true
  );

  switch (choice) {
    case 'web':
      await startWeb();
      await showAppMenu();
      break;
    case 'tauri':
      await startTauri();
      await showAppMenu();
      break;
    case 'desktop-bundle':
      await startDesktopBundle();
      await showAppMenu();
      break;
    case 'build-web':
      await buildApp();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showAppMenu();
      break;
    case 'build-tauri':
      await buildTauri();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showAppMenu();
      break;
    case 'back':
      break;
  }
}

// Start app (web)
async function startAll() {
  console.log(chalk.cyan('\nStarting Skriuw web...\n'));
  await startWeb();
}

// Show menu when all apps are running
async function showAllAppsMenu() {
  while (true) {
    const action = await numericMenu(
      'Skriuw running',
      [
        {
          label: 'Open',
          items: [{ name: 'Open Skriuw in browser', value: 'open' }],
        },
        {
          label: 'Manage',
          items: [{ name: 'Stop web', value: 'stop' }],
        },
      ],
      true
    );

    switch (action) {
      case 'open':
        await open('http://localhost:3000');
        break;
      case 'stop':
        console.log(chalk.yellow('\nStopping web...'));
        killProcess(runningProcesses.web);
        runningProcesses.web = null;
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log(chalk.green('Stopped.\n'));
        return;
      case 'back':
        return;
    }
  }
}

// Build all apps
async function buildAll() {
  console.log(chalk.cyan('\n📦 Building all apps...\n'));

  await buildApp();

  console.log(chalk.green('\n✅ All apps built!\n'));
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
}

// Show help
function showHelp() {
  console.clear();
  showWelcome();
  console.log(chalk.bold.white('  Help\n'));
  console.log(chalk.white('  Navigation:'));
  console.log(chalk.gray('    • Press numbers (1, 2, 3...) to select'));
  console.log(chalk.gray('    • Press Backspace to go back'));
  console.log(chalk.gray('    • Press Enter to confirm\n'));

  console.log(chalk.white('  App Structure:'));
  console.log(chalk.gray('    • Root app - Tauri + Next.js + Skriuw\n'));

  console.log(chalk.white('  Ports:'));
  console.log(chalk.gray('    • Skriuw web: http://localhost:3000\n'));

  console.log(chalk.white('  Commands:'));
  console.log(chalk.gray('    • ./start        - Launch this menu'));
  console.log(chalk.gray('    • npm run dev    - Start web directly'));
  console.log(chalk.gray('    • npm run build  - Build web directly\n'));
}

// Main menu
async function showMainMenu() {
  console.clear();
  showWelcome();

  const webUpdated = getLastUpdated('.');

  const choice = await numericMenu(
    'Main menu',
    [
      {
        label: 'App',
        items: [
          { name: `Skriuw ${chalk.gray(`(Updated: ${webUpdated})`)}`, value: 'web' },
        ],
      },
      {
        label: 'Operations',
        items: [
          { name: 'Start all apps', value: 'start-all' },
          { name: 'Build all apps', value: 'build-all' },
        ],
      },
      {
        label: 'DB Management',
        items: [{ name: 'Manage Database', value: 'db-management' }],
      },
      {
        label: 'Other',
        items: [
          { name: 'Help', value: 'help' },
          { name: 'Exit', value: 'exit' },
        ],
      },
    ],
    false
  );

  switch (choice) {
    case 'web':
      await showAppMenu();
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
    case 'db-management':
      await showDbMenu();
      await showMainMenu();
      break;
    case 'help':
      showHelp();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showMainMenu();
      break;
    case 'exit':
      console.log(chalk.cyan('\nGoodbye.\n'));
      process.exit(0);
  }
}

// DB Management Menu
async function showDbMenu() {
  console.clear();
  showWelcome();
  console.log(chalk.bold.white('  DB Management\n'));

  const choice = await numericMenu(
    'Choose an action',
    [
      {
        label: 'Database',
        items: [
          { name: 'Clear entire database', value: 'clear-db' },
          { name: 'Clear a single table', value: 'clear-table' },
          { name: 'Dry run: clear entire database', value: 'dry-clear-db' },
          { name: 'Dry run: clear a single table', value: 'dry-clear-table' },
        ],
      },
    ],
    true
  );

  switch (choice) {
    case 'clear-db':
      await clearDatabase();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showDbMenu();
      break;
    case 'clear-table':
      await clearSingleTable();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showDbMenu();
      break;
    case 'dry-clear-db':
      await clearDatabase(true);
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showDbMenu();
      break;
    case 'dry-clear-table':
      await clearSingleTable(true);
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue' }]);
      await showDbMenu();
      break;
    case 'back':
      break;
  }
}

async function clearDatabase(dryRun = false) {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: dryRun
        ? 'Perform a dry run to estimate deletes for ALL tables?'
        : 'Are you sure you want to clear the entire database? This action cannot be undone.',
      default: false,
    },
  ]);

  if (confirm) {
    const spinner = ora(dryRun ? 'Dry running database clear...' : 'Clearing database...').start();
    return new Promise((resolve) => {
      const args = ['./clear-db.mjs', '--all'];
      if (dryRun) args.push('--dry-run');
      const proc = spawn('node', args, {
        cwd: __dirname,
        stdio: 'inherit',
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          spinner.succeed(
            chalk.green(dryRun ? 'Dry run completed successfully.' : 'Database cleared successfully!')
          );
        } else {
          spinner.fail(chalk.red(dryRun ? 'Dry run failed.' : 'Failed to clear database.'));
        }
        resolve();
      });
    });
  } else {
    console.log(chalk.yellow('Database clearing cancelled.'));
  }
}

async function clearSingleTable(dryRun = false) {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: dryRun ? 'Dry run: estimate deletes for a single table?' : 'Clear records from a single table?',
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Operation cancelled.'));
    return;
  }

  const { table } = await inquirer.prompt([
    {
      type: 'list',
      name: 'table',
      message: 'Select a table to clear',
      choices: [
        { name: 'comments', value: 'comments' },
        { name: 'activity', value: 'activity' },
        { name: 'tasks', value: 'tasks' },
        { name: 'notes', value: 'notes' },
        { name: 'folders', value: 'folders' },
      ],
    },
  ]);

  const spinner = ora(dryRun ? `Dry running clear for "${table}"...` : `Clearing table "${table}"...`).start();
  return new Promise((resolve) => {
    const args = ['./clear-db.mjs', '--table', table];
    if (dryRun) args.push('--dry-run');
    const proc = spawn('node', args, {
      cwd: __dirname,
      stdio: 'inherit',
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        spinner.succeed(
          chalk.green(dryRun ? `Dry run completed for "${table}".` : `Cleared table "${table}" successfully!`)
        );
      } else {
        spinner.fail(chalk.red(dryRun ? `Dry run failed for "${table}".` : `Failed to clear table "${table}".`));
      }
      resolve();
    });
  });
}


// Cleanup on exit
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nStopping all processes...'));
  Object.values(runningProcesses).forEach(killProcess);
  console.log(chalk.green('Cleanup complete.\n'));
  process.exit(0);
});

process.on('exit', () => {
  Object.values(runningProcesses).forEach(killProcess);
});

// Start the CLI
showMainMenu();

// --- Numeric menu helper with Backspace to go back ---

/**
 * Renders a numeric menu with optional grouped sections. Users can:
 * - Press a number key to select an item
 * - Press Backspace to go back (returns 'back' if includeBack is true)
 * - Press Enter to do nothing (waits)
 */
async function numericMenu(title, groups, includeBack) {
  // Flatten items and assign numbers
  const flat = [];
  groups.forEach((g) => {
    g.items.forEach((it) => {
      if (!it.disabled) flat.push({ display: it.name, value: it.value });
    });
  });
  let index = 1;

  // Render
  console.log(chalk.bold.white(`\n  ${title}`));
  groups.forEach((group) => {
    const enabledItems = group.items.filter((i) => !i.disabled);
    if (enabledItems.length === 0) return;
    console.log(chalk.gray(`\n  ${group.label}:`));
    enabledItems.forEach((item) => {
      console.log(chalk.white(`    (${index}) ${item.name}`));
      index += 1;
    });
  });
  if (includeBack) {
    console.log(chalk.gray(`\n  Backspace: Back`));
  }
  console.log('');

  return await waitForNumericChoice(flat, includeBack);
}

function waitForNumericChoice(items, includeBack) {
  return new Promise((resolve) => {
    const onData = (data) => {
      const str = data.toString('utf8');
      // Backspace
      if (includeBack && (str === '\b' || str === '\x7f')) {
        process.stdout.write('\n');
        cleanup();
        resolve('back');
        return;
      }
      // Single digit 1-9
      const code = str.charCodeAt(0);
      if (code >= 49 && code <= 57) {
        const idx = code - 49; // '1' => 0
        if (idx >= 0 && idx < items.length) {
          const chosen = items[idx].value;
          process.stdout.write(` ${idx + 1}\n`);
          cleanup();
          resolve(chosen);
          return;
        }
      }
    };

    const cleanup = () => {
      process.stdin.off('data', onData);
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false);
        } catch { }
      }
      process.stdin.pause();
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

