#!/usr/bin/env node

import { ChildProcess, spawn } from 'child_process';
import readline from 'readline';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import open from 'open';
import { execa } from 'execa';
import { config, AppConfig } from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RunningApp {
  name: string;
  displayName: string;
  port: number;
  path: string;
  process: ChildProcess;
  color: string;
}

class CLIManager {
  private runningApps: Map<string, RunningApp> = new Map();
  private rootDir: string;
  private isListeningForHotkeys: boolean = false;

  constructor() {
    // Navigate to project root
    // From dist/index.js: ../../.. gets to project root
    // From src/index.ts (dev): ../../.. gets to project root
    // More robust: find package.json or go up until we find apps/ directory
    let currentDir = path.resolve(__dirname);
    
    // Try to find project root by looking for apps/ directory or root package.json
    for (let i = 0; i < 5; i++) {
      const appsDir = path.join(currentDir, 'apps');
      const packageJson = path.join(currentDir, 'package.json');
      
      if (existsSync(appsDir) && existsSync(packageJson)) {
        this.rootDir = currentDir;
        return;
      }
      
      currentDir = path.resolve(currentDir, '..');
    }
    
    // Fallback to 3 levels up (original behavior)
    this.rootDir = path.resolve(__dirname, '../../..');
  }

  // Display ASCII logo
  showLogo(): void {
    console.clear();
    console.log(chalk.cyan(config.logo.join('\n')));
    console.log();
  }

  // Main menu
  async showMainMenu(): Promise<void> {
    this.showLogo();

    const choices = [
      new inquirer.Separator(chalk.bold.cyan('── Development ──')),
      ...config.apps.map(app => ({
        name: `Run ${chalk.blue(app.displayName)} ${chalk.gray(`(port ${app.port})`)}`,
        value: `dev:${app.name}`
      })),
      { name: 'Run All Apps', value: 'dev:all' },
      new inquirer.Separator(chalk.bold.green('── Build ──')),
      ...config.apps.map(app => ({
        name: `Build ${chalk.blue(app.displayName)}`,
        value: `build:${app.name}`
      })),
      { name: 'Build All Apps', value: 'build:all' },
      new inquirer.Separator(chalk.bold.yellow('── Deploy ──')),
      { name: 'Deploy to Staging', value: 'deploy:staging' },
      { name: 'Deploy to Production', value: 'deploy:production' },
      new inquirer.Separator(chalk.bold.magenta('── Utilities ──')),
      { name: 'Open Repository', value: 'repo:open' },
      { name: 'Manage Running Apps', value: 'manage:apps' },
      new inquirer.Separator(),
      { name: chalk.red('Exit'), value: 'exit' }
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices,
        pageSize: 20
      }
    ]);

    await this.handleAction(action);
  }

  // Handle menu actions
  async handleAction(action: string): Promise<void> {
    const [type, target] = action.split(':');

    switch (type) {
      case 'dev':
        if (target === 'all') {
          await this.runAllApps();
        } else {
          await this.runApp(target);
        }
        break;
      case 'build':
        if (target === 'all') {
          await this.buildAllApps();
        } else {
          await this.buildApp(target);
        }
        break;
      case 'deploy':
        await this.deploy(target);
        break;
      case 'repo':
        await this.openRepository();
        break;
      case 'manage':
        await this.manageRunningApps();
        break;
      case 'exit':
        await this.cleanup();
        process.exit(0);
        break;
    }
  }

  // Run a single app
  async runApp(appName: string): Promise<void> {
    const app = config.apps.find(a => a.name === appName);
    if (!app) {
      console.log(chalk.red(`\n[ERROR] App "${appName}" not found`));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    if (this.runningApps.has(appName)) {
      console.log(chalk.yellow(`\n[WARN] ${app.displayName} is already running`));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    const spinner = ora(`Starting ${app.displayName}...`).start();

    try {
      const appPath = path.join(this.rootDir, app.path);
      const [command, ...args] = app.dev.split(' ');
      
      const proc = spawn(command, args, {
        cwd: appPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        detached: false
      });

      // Store the running app
      this.runningApps.set(appName, {
        name: appName,
        displayName: app.displayName,
        port: app.port,
        path: app.path,
        process: proc,
        color: app.color
      });

      // Handle process output (suppress noisy Next.js output)
      let isReady = false;
      proc.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        if (output.includes('Ready') || output.includes('started') || output.includes('localhost')) {
          if (!isReady) {
            isReady = true;
            spinner.succeed(chalk.green(`${app.displayName} is running`));
            this.displayAppInfo(app);
            this.startHotkeyListener();
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const error = data.toString();
        // Filter out common warnings/info
        if (!error.includes('warn') && !error.includes('info')) {
          console.log(chalk.yellow(`[${app.displayName}] ${error}`));
        }
      });

      proc.on('exit', (code) => {
        this.runningApps.delete(appName);
        if (code !== 0 && code !== null) {
          console.log(chalk.red(`\n[ERROR] ${app.displayName} exited with code ${code}`));
        }
      });

      // Wait a bit for the process to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      if (!isReady) {
        spinner.succeed(chalk.green(`${app.displayName} is starting...`));
        this.displayAppInfo(app);
        this.startHotkeyListener();
      }

    } catch (error) {
      spinner.fail(chalk.red(`Failed to start ${app.displayName}`));
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
      await this.pressEnterToContinue();
    }

    return this.showMainMenu();
  }

  // Display app info
  displayAppInfo(app: AppConfig): void {
    console.log();
    console.log(chalk.cyan('┌────────────────────────────────────────┐'));
    console.log(chalk.cyan('│') + '  ' + chalk.bold.white(app.displayName.padEnd(36)) + chalk.cyan('  │'));
    console.log(chalk.cyan('├────────────────────────────────────────┤'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Status:'.padEnd(12)) + chalk.green('Running'.padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Port:'.padEnd(12)) + chalk.white(String(app.port).padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Path:'.padEnd(12)) + chalk.white(app.path.padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('URL:'.padEnd(12)) + chalk.blue(`http://localhost:${app.port}`.padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('└────────────────────────────────────────┘'));
    console.log();
  }

  // Run all apps
  async runAllApps(): Promise<void> {
    console.clear();
    console.log(chalk.bold.cyan('\nStarting all apps...\n'));

    for (const app of config.apps) {
      if (!this.runningApps.has(app.name)) {
        await this.runApp(app.name);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return this.showMainMenu();
  }

  // Build a single app
  async buildApp(appName: string): Promise<void> {
    const app = config.apps.find(a => a.name === appName);
    if (!app) {
      console.log(chalk.red(`\n[ERROR] App "${appName}" not found`));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    console.clear();
    const startTime = Date.now();
    const spinner = ora(`Building ${app.displayName}...`).start();

    try {
      const appPath = path.join(this.rootDir, app.path);
      const [command, ...args] = app.build.split(' ');

      await execa(command, args, {
        cwd: appPath,
        stdio: 'inherit'
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      spinner.succeed(chalk.green(`${app.displayName} built successfully in ${duration}s`));
      
      console.log();
      console.log(chalk.cyan('┌────────────────────────────────────────┐'));
      console.log(chalk.cyan('│') + '  ' + chalk.bold.white('Build Summary'.padEnd(36)) + chalk.cyan('  │'));
      console.log(chalk.cyan('├────────────────────────────────────────┤'));
      console.log(chalk.cyan('│') + '  ' + chalk.gray('App:'.padEnd(12)) + chalk.white(app.displayName.padEnd(24)) + chalk.cyan('  │'));
      console.log(chalk.cyan('│') + '  ' + chalk.gray('Duration:'.padEnd(12)) + chalk.white(`${duration}s`.padEnd(24)) + chalk.cyan('  │'));
      console.log(chalk.cyan('│') + '  ' + chalk.gray('Status:'.padEnd(12)) + chalk.green('Success'.padEnd(24)) + chalk.cyan('  │'));
      console.log(chalk.cyan('└────────────────────────────────────────┘'));
      console.log();

    } catch (error) {
      spinner.fail(chalk.red(`Failed to build ${app.displayName}`));
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    }

    await this.pressEnterToContinue();
    return this.showMainMenu();
  }

  // Build all apps
  async buildAllApps(): Promise<void> {
    console.clear();
    console.log(chalk.bold.cyan('\nBuilding all apps...\n'));

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    for (const app of config.apps) {
      try {
        const spinner = ora(`Building ${app.displayName}...`).start();
        const appPath = path.join(this.rootDir, app.path);
        const [command, ...args] = app.build.split(' ');

        await execa(command, args, {
          cwd: appPath,
          stdio: 'pipe'
        });

        spinner.succeed(chalk.green(`${app.displayName} built successfully`));
        successCount++;
      } catch (error) {
        failCount++;
        console.log(chalk.red(`[ERROR] Failed to build ${app.displayName}`));
      }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log();
    console.log(chalk.cyan('┌────────────────────────────────────────┐'));
    console.log(chalk.cyan('│') + '  ' + chalk.bold.white('Build Summary'.padEnd(36)) + chalk.cyan('  │'));
    console.log(chalk.cyan('├────────────────────────────────────────┤'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Total Apps:'.padEnd(12)) + chalk.white(String(config.apps.length).padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Successful:'.padEnd(12)) + chalk.green(String(successCount).padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Failed:'.padEnd(12)) + chalk.red(String(failCount).padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Duration:'.padEnd(12)) + chalk.white(`${totalDuration}s`.padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('└────────────────────────────────────────┘'));
    console.log();

    await this.pressEnterToContinue();
    return this.showMainMenu();
  }

  // Deploy
  async deploy(target: string): Promise<void> {
    if (target !== 'staging' && target !== 'production') {
      console.log(chalk.red(`\n[ERROR] Invalid deploy target: ${target}`));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }
    
    const deployTarget = target as 'staging' | 'production';
    console.clear();
    const command = config.deploy[deployTarget];
    const spinner = ora(`Deploying to ${target}...`).start();

    try {
      const result = await execa(command, [], {
        cwd: this.rootDir,
        stdio: 'inherit'
      });

      spinner.succeed(chalk.green(`Deployed to ${target} successfully`));
    } catch (error) {
      spinner.fail(chalk.red(`Deployment to ${target} failed`));
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    }

    await this.pressEnterToContinue();
    return this.showMainMenu();
  }

  // Open repository
  async openRepository(): Promise<void> {
    const spinner = ora('Fetching repository URL...').start();

    try {
      const { stdout } = await execa('git', ['remote', '-v'], {
        cwd: this.rootDir
      });

      const match = stdout.match(/https:\/\/[^\s]+/);
      if (match) {
        const url = match[0].replace('.git', '');
        spinner.succeed(chalk.green('Opening repository...'));
        await open(url);
      } else {
        spinner.fail(chalk.red('No remote repository found'));
      }
    } catch (error) {
      spinner.fail(chalk.red('Failed to get repository URL'));
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    }

    await this.pressEnterToContinue();
    return this.showMainMenu();
  }

  // Manage running apps (hotkeys)
  async manageRunningApps(): Promise<void> {
    if (this.runningApps.size === 0) {
      console.log(chalk.yellow('\n[INFO] No apps are currently running'));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    const appChoices = Array.from(this.runningApps.values()).map(app => ({
      name: `${chalk.green('●')} ${app.displayName} ${chalk.gray(`(port ${app.port})`)}`,
      value: app.name
    }));

    const { selectedApp } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedApp',
        message: 'Select an app to manage:',
        choices: [...appChoices, new inquirer.Separator(), { name: chalk.gray('← Back'), value: 'back' }]
      }
    ]);

    if (selectedApp === 'back') {
      return this.showMainMenu();
    }

    await this.manageApp(selectedApp);
  }

  // Manage individual app
  async manageApp(appName: string): Promise<void> {
    const runningApp = this.runningApps.get(appName);
    if (!runningApp) return this.showMainMenu();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `Manage ${runningApp.displayName}:`,
        choices: [
          { name: `${chalk.blue('O')} - Open in Browser`, value: 'open' },
          { name: `${chalk.blue('C')} - Open in ${config.editor}`, value: 'code' },
          { name: `${chalk.blue('R')} - Restart`, value: 'restart' },
          { name: `${chalk.blue('S')} - Stop`, value: 'stop' },
          { name: `${chalk.blue('I')} - Install Package`, value: 'install' },
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: 'back' }
        ]
      }
    ]);

    switch (action) {
      case 'open':
        await this.openInBrowser(runningApp);
        break;
      case 'code':
        await this.openInEditor(runningApp);
        break;
      case 'restart':
        await this.restartApp(runningApp);
        break;
      case 'stop':
        await this.stopApp(runningApp);
        break;
      case 'install':
        await this.installPackage(runningApp);
        break;
      case 'back':
        return this.manageRunningApps();
    }

    return this.manageRunningApps();
  }

  // Open in browser
  async openInBrowser(app: RunningApp): Promise<void> {
    const spinner = ora(`Opening ${app.displayName} in browser...`).start();
    try {
      await open(`http://localhost:${app.port}`);
      spinner.succeed(chalk.green(`Opened ${app.displayName} in browser`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to open browser'));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Open in editor
  async openInEditor(app: RunningApp): Promise<void> {
    const spinner = ora(`Opening ${app.displayName} in ${config.editor}...`).start();
    try {
      const appPath = path.join(this.rootDir, app.path);
      await execa(config.editor, [appPath]);
      spinner.succeed(chalk.green(`Opened ${app.displayName} in ${config.editor}`));
    } catch (error) {
      spinner.fail(chalk.red(`Failed to open ${config.editor}`));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Restart app
  async restartApp(app: RunningApp): Promise<void> {
    const spinner = ora(`Restarting ${app.displayName}...`).start();
    
    // Stop the app
    app.process.kill();
    this.runningApps.delete(app.name);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    spinner.text = `Starting ${app.displayName}...`;
    
    // Start it again
    await this.runApp(app.name);
    
    spinner.succeed(chalk.green(`${app.displayName} restarted successfully`));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Stop app
  async stopApp(app: RunningApp): Promise<void> {
    const spinner = ora(`Stopping ${app.displayName}...`).start();
    
    app.process.kill();
    this.runningApps.delete(app.name);
    
    spinner.succeed(chalk.green(`${app.displayName} stopped`));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Install package
  async installPackage(app: RunningApp): Promise<void> {
    const { packageName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'packageName',
        message: 'Enter package name to install:',
        validate: (input: string) => input.trim().length > 0 || 'Package name is required'
      }
    ]);

    const spinner = ora(`Installing ${packageName} in ${app.displayName}...`).start();

    try {
      const appPath = path.join(this.rootDir, app.path);
      await execa('bun', ['add', packageName], {
        cwd: appPath,
        stdio: 'pipe'
      });

      spinner.succeed(chalk.green(`${packageName} installed successfully`));
    } catch (error) {
      spinner.fail(chalk.red(`Failed to install ${packageName}`));
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Start hotkey listener
  startHotkeyListener(): void {
    if (this.isListeningForHotkeys) return;
    
    this.isListeningForHotkeys = true;
    
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
    }

    console.log(chalk.gray('\nHotkeys: [O]pen | [C]ode | [R]estart | [S]top | [I]nstall | [M]enu'));
    console.log();
  }

  // Cleanup
  async cleanup(): Promise<void> {
    console.log(chalk.yellow('\n\nShutting down all apps...'));
    
    for (const [name, app] of this.runningApps) {
      console.log(chalk.gray(`Stopping ${app.displayName}...`));
      app.process.kill();
    }
    
    this.runningApps.clear();
    console.log(chalk.green('[SUCCESS] All apps stopped'));
    console.log(chalk.cyan('\nGoodbye!\n'));
  }

  // Press enter to continue
  async pressEnterToContinue(): Promise<void> {
    await inquirer.prompt({
      type: 'input',
      name: 'continue',
      message: chalk.gray('Press Enter to continue...')
    });
  }

  // Start the CLI
  async start(): Promise<void> {
    // Handle process termination
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await this.cleanup();
      process.exit(0);
    });

    // Show main menu
    await this.showMainMenu();
  }
}

// Start the CLI
const cli = new CLIManager();
cli.start().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});

