#!/usr/bin/env node

import { ChildProcess, spawn } from 'child_process';
import readline from 'readline';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import open from 'open';
import { execa } from 'execa';
import { config, AppConfig, ToolConfig } from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import { StorageManager } from './storage.js';
import { LogManager } from './logging.js';
import Fuse from 'fuse.js';
import { join } from 'path';
import { FrameworkDetector, FrameworkConfig } from './framework.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RunningApp {
  name: string;
  displayName: string;
  port: number;
  path: string;
  process: ChildProcess;
  color: string;
  framework?: FrameworkConfig;
  detectedPort?: number;
}

class CLIManager {
  private runningApps: Map<string, RunningApp> = new Map();
  private rootDir: string = '';
  private isListeningForHotkeys: boolean = false;
  private hotkeyListener: ((str: string, key: any) => void) | null = null;
  private sigintHandler: (() => void) | null = null;
  private storageManager: StorageManager;
  private logManager: LogManager;

  constructor() {
    const explicitRoot = process.env.SK_ROOT ? path.resolve(process.env.SK_ROOT) : null;
    const searchStarts = [
      explicitRoot,
      path.resolve(process.cwd()),
      path.resolve(__dirname),
      path.resolve(__dirname, '../../..')
    ].filter((value, index, array) => value && array.indexOf(value) === index) as string[];

    for (const start of searchStarts) {
      const maybeRoot = this.findProjectRoot(start);
      if (maybeRoot) {
        this.rootDir = maybeRoot;
        break;
      }
    }

    if (!this.rootDir) {
      console.error(
        chalk.red(
          'Failed to locate the Skriuw project root. Please run `sk` inside the project directory or set SK_ROOT.'
        )
      );
      process.exit(1);
    }

    this.storageManager = new StorageManager();
    this.logManager = new LogManager(this.storageManager);
  }

  private findProjectRoot(start: string): string | null {
    let currentDir = path.resolve(start);

    for (let i = 0; i < 10; i++) {
      const packageJson = path.join(currentDir, 'package.json');
      const appsDir = path.join(currentDir, 'apps');
      const toolsSkDir = path.join(currentDir, 'tools', 'sk');

      if (existsSync(packageJson) && (existsSync(appsDir) || existsSync(toolsSkDir))) {
        return currentDir;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
    }

    return null;
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

    // Auto-detect apps if config is empty or detect single-app mode
    const apps = await this.detectApps();
    
    // Show running apps status
    const runningAppsList = Array.from(this.runningApps.values());
    if (runningAppsList.length > 0) {
      console.log(chalk.green('● Running:'), runningAppsList.map(a => `${a.displayName} (${a.port})`).join(', '));
      console.log();
    }

    const choices = [
      new inquirer.Separator(chalk.bold.cyan(' Development ')),
      ...apps.map(app => {
        const isRunning = this.runningApps.has(app.name);
        const status = isRunning ? chalk.green('●') : chalk.gray('○');
        return {
          name: `${status} ${chalk.blue(app.displayName)} ${chalk.gray(`(port ${app.port})`)}`,
          value: `dev:${app.name}`
        };
      }),
      ...(apps.length > 1 ? [{ name: `${chalk.cyan('▶')} Run All Apps`, value: 'dev:all' }] : []),
      new inquirer.Separator(chalk.bold.green(' Build ')),
      ...apps.map(app => ({
        name: `${chalk.yellow('📦')} Build ${chalk.blue(app.displayName)}`,
        value: `build:${app.name}`
      })),
      ...(apps.length > 1 ? [{ name: `${chalk.yellow('📦')} Build All Apps`, value: 'build:all' }] : []),
      ...(config.tools && config.tools.length > 0 ? [
        new inquirer.Separator(chalk.bold.magenta(' Tools ')),
        ...config.tools.map(tool => ({
          name: `${chalk.magenta('🔧')} ${tool.displayName} ${tool.description ? chalk.gray(`(${tool.description})`) : ''}`,
          value: `tool:${tool.name}`
        }))
      ] : []),
      new inquirer.Separator(chalk.bold.blue(' Utilities ')),
      ...(runningAppsList.length > 0 ? [{ name: `${chalk.blue('⚙')} Manage Running Apps`, value: 'manage:apps' }] : []),
      { name: `${chalk.blue('🔗')} Open Repository`, value: 'repo:open' },
      ...(apps.filter(app => app.deployUrl).length > 0 ? [
        new inquirer.Separator(chalk.bold.yellow(' Deploy ')),
        ...apps.filter(app => app.deployUrl).map(app => ({
          name: `${chalk.yellow('🚀')} Open ${app.displayName} ${chalk.gray(`(${app.deployUrl})`)}`,
          value: `deploy:open:${app.name}`
        })),
        { name: `${chalk.yellow('🚀')} Deploy to Staging`, value: 'deploy:staging' },
        { name: `${chalk.yellow('🚀')} Deploy to Production`, value: 'deploy:production' }
      ] : []),
      new inquirer.Separator(),
      { name: `${chalk.red('✕')} Exit`, value: 'exit' }
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.cyan('Select an option:'),
        choices,
        pageSize: 15
      }
    ]);

    await this.handleAction(action);
  }

  // Handle menu actions
  async handleAction(action: string): Promise<void> {
    const [type, ...rest] = action.split(':');
    const target = rest.join(':');

    try {
      switch (type) {
        case 'dev':
          if (target === 'all') {
            await this.runAllApps();
          } else {
            await this.runApp(target);
          }
          // Don't return to menu if app is running - let it run
          if (this.runningApps.has(target)) {
            return;
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
          if (target.startsWith('open:')) {
            const appName = target.replace('open:', '');
            await this.openDeployUrl(appName);
          } else {
            await this.deploy(target);
          }
          break;
        case 'tool':
          await this.runTool(target);
          break;
        case 'repo':
          await this.openRepository();
          break;
        case 'manage':
          await this.manageRunningApps();
          break;
        case 'advanced':
          await this.showAdvancedMenu(target);
          break;
        case 'exit':
          await this.cleanup();
          process.exit(0);
          return;
        default:
          console.log(chalk.red(`\n[ERROR] Unknown action: ${action}`));
          await this.pressEnterToContinue();
          break;
      }
    } catch (error) {
      console.error(chalk.red(`\n[ERROR] Failed to execute action: ${error instanceof Error ? error.message : String(error)}`));
      await this.pressEnterToContinue();
    }

    // Return to menu after action completes (unless app is running)
    return this.showMainMenu();
  }

  // Detect apps (monorepo or single-app)
  async detectApps(): Promise<AppConfig[]> {
    // If config has apps, use them
    if (config.apps && config.apps.length > 0) {
      return config.apps;
    }

    // Check if this is a monorepo
    const appsDir = path.join(this.rootDir, 'apps');
    if (existsSync(appsDir)) {
      // Auto-detect apps in apps/ directory
      const appDirs = readdirSync(appsDir, { withFileTypes: true })
        .filter((dirent: any) => dirent.isDirectory())
        .map((dirent: any) => dirent.name);

      return appDirs.map((appDir: string) => {
        const appPath = path.join(appsDir, appDir);
        const frameworkConfig = FrameworkDetector.detect(appPath);
        
        return {
          name: appDir,
          displayName: appDir.charAt(0).toUpperCase() + appDir.slice(1),
          path: `./apps/${appDir}`,
          dev: frameworkConfig.devCommand,
          build: frameworkConfig.buildCommand,
          port: frameworkConfig.port,
          color: '#3b82f6'
        };
      });
    }

    // Single-app mode: detect framework in current directory
    const frameworkConfig = FrameworkDetector.detect(this.rootDir);
    return [{
      name: 'app',
      displayName: 'App',
      path: '.',
      dev: frameworkConfig.devCommand,
      build: frameworkConfig.buildCommand,
      port: frameworkConfig.port,
      color: '#3b82f6'
    }];
  }

  // Check if port is in use
  async checkPortInUse(port: number): Promise<boolean> {
    try {
      const { stdout } = await execa('lsof', ['-i', `:${port}`], {
        cwd: this.rootDir,
        reject: false
      });
      return stdout.trim().length > 0;
    } catch {
      // If lsof fails, try netstat (Linux fallback)
      try {
        const { stdout } = await execa('netstat', ['-an'], {
          cwd: this.rootDir,
          reject: false
        });
        return stdout.includes(`:${port}`);
      } catch {
        return false;
      }
    }
  }

  // Run a single app
  async runApp(appName: string): Promise<void> {
    const apps = await this.detectApps();
    const app = apps.find(a => a.name === appName);
    if (!app) {
      console.log(chalk.red(`\n[ERROR] App "${appName}" not found`));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    // Detect framework for this app
    const appPath = path.join(this.rootDir, app.path);
    const frameworkConfig = FrameworkDetector.detect(appPath);
    
    // Use detected port if available, otherwise use config port
    let port = app.port;
    if (frameworkConfig.port && frameworkConfig.port !== 3000) {
      port = frameworkConfig.port;
    }

    // Check port conflict
    const portInUse = await this.checkPortInUse(port);
    if (portInUse && !this.runningApps.has(appName)) {
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: `Port ${port} is already in use. Continue anyway?`,
          default: false
        }
      ]);
      if (!proceed) {
        return this.showMainMenu();
      }
    }

    if (this.runningApps.has(appName)) {
      console.log(chalk.yellow(`\n[WARN] ${app.displayName} is already running`));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    const spinner = ora(`Starting ${app.displayName}...`).start();
    this.logManager.log('info', `Starting ${app.displayName}`, appName);

    try {
      const [command, ...args] = frameworkConfig.devCommand.split(' ');
      
      const proc = spawn(command, args, {
        cwd: appPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        detached: false
      });

      // Store the running app with framework config
      let detectedPort = port;
      this.runningApps.set(appName, {
        name: appName,
        displayName: app.displayName,
        port: detectedPort,
        path: app.path,
        process: proc,
        color: app.color,
        framework: frameworkConfig,
        detectedPort: detectedPort
      });

      // Handle process output with framework-specific patterns
      let isReady = false;
      proc.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        
        // Extract port from output if detected
        const extractedPort = FrameworkDetector.extractPort(output, frameworkConfig.portPatterns);
        if (extractedPort && extractedPort !== detectedPort) {
          detectedPort = extractedPort;
          const runningApp = this.runningApps.get(appName);
          if (runningApp) {
            runningApp.port = detectedPort;
            runningApp.detectedPort = detectedPort;
            // Re-check port conflict with new port
            this.checkPortInUse(detectedPort).then(inUse => {
              if (inUse && !this.runningApps.has(appName)) {
                console.log(chalk.yellow(`\n[WARN] Detected port ${detectedPort} is in use`));
              }
            });
          }
        }
        
        // Check if ready using framework-specific patterns
        if (FrameworkDetector.isReady(output, frameworkConfig.readyPatterns)) {
          if (!isReady) {
            isReady = true;
            spinner.succeed(chalk.green(`${app.displayName} is running`));
            this.logManager.log('info', `${app.displayName} is running on port ${detectedPort}`, appName);
            
            // Update app info with detected port
            const updatedApp = { ...app, port: detectedPort };
            this.displayAppInfo(updatedApp);
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
        // Ensure cleanup happens
        this.runningApps.delete(appName);
        if (code !== 0 && code !== null) {
          console.log(chalk.red(`\n[ERROR] ${app.displayName} exited with code ${code}`));
          this.logManager.log('error', `${app.displayName} exited with code ${code}`, appName);
        } else {
          this.logManager.log('info', `${app.displayName} stopped`, appName);
        }
      });

      proc.on('error', (error) => {
        // Handle process spawn errors
        this.runningApps.delete(appName);
        spinner.fail(chalk.red(`Failed to start ${app.displayName}`));
        console.log(chalk.red(error.message));
        this.logManager.log('error', `Process spawn error: ${error.message}`, appName);
      });

      // Wait a bit for the process to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (!isReady) {
        spinner.succeed(chalk.green(`${app.displayName} is starting...`));
        this.logManager.log('info', `${app.displayName} is starting...`, appName);
        this.displayAppInfo(app);
        this.startHotkeyListener();
      }

      // Show status and return to menu
      console.log(chalk.gray('\nPress [M] in the menu to return, or Ctrl+C to stop all apps.\n'));
      
    } catch (error) {
      spinner.fail(chalk.red(`Failed to start ${app.displayName}`));
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(errorMsg));
      this.logManager.log('error', `Failed to start: ${errorMsg}`, appName);
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    // Don't return to menu immediately - let the app run
    // User can press Ctrl+C or use hotkeys to manage
    return;
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
    if (app.deployUrl) {
      console.log(chalk.cyan('│') + '  ' + chalk.gray('Deploy:'.padEnd(12)) + chalk.blue(app.deployUrl.padEnd(24)) + chalk.cyan('  │'));
    }
    console.log(chalk.cyan('└────────────────────────────────────────┘'));
    console.log();
  }

  // Run all apps
  async runAllApps(): Promise<void> {
    console.clear();
    console.log(chalk.bold.cyan('\nStarting all apps...\n'));

    const apps = await this.detectApps();
    let startedCount = 0;
    
    for (const app of apps) {
      if (!this.runningApps.has(app.name)) {
        console.log(chalk.gray(`Starting ${app.displayName}...`));
        await this.runApp(app.name);
        startedCount++;
        // Small delay between starts
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(chalk.yellow(`${app.displayName} is already running`));
      }
    }

    if (startedCount > 0) {
      console.log(chalk.green(`\n✓ Started ${startedCount} app(s)`));
      console.log(chalk.gray('Press [M] in the menu to return, or Ctrl+C to stop all apps.\n'));
    } else {
      console.log(chalk.yellow('\nAll apps are already running.\n'));
      await this.pressEnterToContinue();
    }

    // Don't return to menu immediately - let apps run
    return;
  }

  // Build a single app
  async buildApp(appName: string): Promise<void> {
    const apps = await this.detectApps();
    const app = apps.find(a => a.name === appName);
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
      const frameworkConfig = FrameworkDetector.detect(appPath);
      const [command, ...args] = frameworkConfig.buildCommand.split(' ');

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

    const apps = await this.detectApps();
    for (const app of apps) {
      try {
        const spinner = ora(`Building ${app.displayName}...`).start();
        const appPath = path.join(this.rootDir, app.path);
        const frameworkConfig = FrameworkDetector.detect(appPath);
        const [command, ...args] = frameworkConfig.buildCommand.split(' ');

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
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Total Apps:'.padEnd(12)) + chalk.white(String(apps.length).padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Successful:'.padEnd(12)) + chalk.green(String(successCount).padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Failed:'.padEnd(12)) + chalk.red(String(failCount).padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('│') + '  ' + chalk.gray('Duration:'.padEnd(12)) + chalk.white(`${totalDuration}s`.padEnd(24)) + chalk.cyan('  │'));
    console.log(chalk.cyan('└────────────────────────────────────────┘'));
    console.log();

    await this.pressEnterToContinue();
    return this.showMainMenu();
  }

  // Open deploy URL
  async openDeployUrl(appName: string): Promise<void> {
    const apps = await this.detectApps();
    const app = apps.find(a => a.name === appName);
    
    if (!app || !app.deployUrl) {
      console.log(chalk.red(`\n[ERROR] App "${appName}" not found or has no deploy URL`));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    const spinner = ora(`Opening ${app.deployUrl}...`).start();
    try {
      await open(app.deployUrl);
      spinner.succeed(chalk.green(`Opened ${app.displayName} deploy URL`));
    } catch (error) {
      spinner.fail(chalk.red('Failed to open deploy URL'));
    }
    
    await this.pressEnterToContinue();
    return this.showMainMenu();
  }

  // Run tool
  async runTool(toolName: string): Promise<void> {
    if (!config.tools || config.tools.length === 0) {
      console.log(chalk.red('\n[ERROR] No tools configured'));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    const tool = config.tools.find(t => t.name === toolName);
    if (!tool) {
      console.log(chalk.red(`\n[ERROR] Tool "${toolName}" not found`));
      await this.pressEnterToContinue();
      return this.showMainMenu();
    }

    console.clear();
    const spinner = ora(`Running ${tool.displayName}...`).start();
    this.logManager.log('info', `Running ${tool.displayName}`, toolName);

    try {
      const toolPath = path.join(this.rootDir, tool.path);
      const [command, ...args] = tool.command.split(' ');
      
      await execa(command, args, {
        cwd: toolPath,
        stdio: 'inherit'
      });

      spinner.succeed(chalk.green(`${tool.displayName} completed successfully`));
      this.logManager.log('info', `${tool.displayName} completed successfully`, toolName);
    } catch (error) {
      spinner.fail(chalk.red(`${tool.displayName} failed`));
      this.logManager.log('error', `${tool.displayName} failed: ${error}`, toolName);
    }

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
    
    // Stop the app with graceful shutdown
    app.process.kill('SIGTERM');
    
    // Wait for clean shutdown with timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        app.process.kill('SIGKILL');
        resolve();
      }, 5000);
      
      app.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    
    this.runningApps.delete(app.name);
    
    spinner.text = `Starting ${app.displayName}...`;
    
    // Start it again
    await this.runApp(app.name);
    
    spinner.succeed(chalk.green(`${app.displayName} restarted successfully`));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Stop app
  async stopApp(app: RunningApp): Promise<void> {
    const spinner = ora(`Stopping ${app.displayName}...`).start();
    
    app.process.kill('SIGTERM');
    
    // Wait for clean shutdown with timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        app.process.kill('SIGKILL');
        resolve();
      }, 5000);
      
      app.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    
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
      
      this.hotkeyListener = async (str: string, key: any) => {
        if (key.ctrl && key.name === 'c') {
          await this.cleanup();
          process.exit(0);
          return;
        }

        const keyName = key.name?.toLowerCase();
        
        if (this.runningApps.size === 0) return;
        
        // Get first running app for hotkeys
        const firstApp = Array.from(this.runningApps.values())[0];
        
        switch (keyName) {
          case 'o':
            await this.openInBrowser(firstApp);
            break;
          case 'c':
            await this.openInEditor(firstApp);
            break;
          case 'r':
            await this.restartApp(firstApp);
            break;
          case 's':
            await this.stopApp(firstApp);
            break;
          case 'i':
            await this.installPackage(firstApp);
            break;
          case 'm':
            // Stop hotkey listener and return to menu
            this.stopHotkeyListener();
            console.clear();
            await this.showMainMenu();
            break;
        }
      };
      
      process.stdin.on('keypress', this.hotkeyListener);
    }

    console.log(chalk.gray('\nHotkeys: [O]pen | [C]ode | [R]estart | [S]top | [I]nstall | [M]enu'));
    console.log();
  }

  // Stop hotkey listener
  stopHotkeyListener(): void {
    if (!this.isListeningForHotkeys) return;
    
    if (this.hotkeyListener && process.stdin.isTTY) {
      process.stdin.removeListener('keypress', this.hotkeyListener);
      process.stdin.setRawMode(false);
      this.hotkeyListener = null;
    }
    
    this.isListeningForHotkeys = false;
  }

  // Advanced Menu
  async showAdvancedMenu(target: string): Promise<void> {
    if (target === 'menu') {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Advanced Options:',
          choices: [
            new inquirer.Separator(chalk.bold.cyan('── Storage Configuration ──')),
            { name: 'Storage Configuration', value: 'advanced:storage' },
            new inquirer.Separator(chalk.bold.green('── Logs ──')),
            { name: 'View Logs', value: 'advanced:logs:view' },
            { name: 'Logs Configuration', value: 'advanced:logs:config' },
            new inquirer.Separator(chalk.bold.yellow('── System ──')),
            { name: 'Health Check', value: 'advanced:health' },
            { name: 'Update Version', value: 'advanced:version' },
            { name: 'Reinstall SK', value: 'advanced:reinstall' },
            new inquirer.Separator(),
            { name: chalk.gray('← Back'), value: 'back' }
          ]
        }
      ]);

      if (action === 'back') {
        return this.showMainMenu();
      }

      await this.handleAction(action);
    } else {
      await this.handleAdvancedAction(target);
    }
  }

  // Handle advanced actions
  async handleAdvancedAction(action: string): Promise<void> {
    const [category, subcategory] = action.split(':');

    switch (category) {
      case 'storage':
        await this.handleStorageConfig();
        break;
      case 'logs':
        if (subcategory === 'view') {
          await this.viewLogs();
        } else if (subcategory === 'config') {
          await this.handleLogsConfig();
        }
        break;
      case 'health':
        await this.healthCheck();
        break;
      case 'version':
        await this.updateVersion();
        break;
      case 'reinstall':
        await this.reinstallSK();
        break;
    }

    return this.showAdvancedMenu('menu');
  }

  // Storage Configuration
  async handleStorageConfig(): Promise<void> {
    const storageConfig = this.storageManager.getConfig();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Storage Configuration:',
        choices: [
          { name: `Set Storage Path (Current: ${storageConfig.storagePath})`, value: 'set-path' },
          { name: `Disable Storage ${storageConfig.storageEnabled ? '' : '(Currently Disabled)'}`, value: 'disable' },
          { name: `Enable Storage ${storageConfig.storageEnabled ? '(Currently Enabled)' : ''}`, value: 'enable' },
          { name: 'Open Storage Path', value: 'open' },
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: 'back' }
        ]
      }
    ]);

    if (action === 'back') return;

    switch (action) {
      case 'set-path':
        const { path: newPath } = await inquirer.prompt([
          {
            type: 'input',
            name: 'path',
            message: 'Enter storage path:',
            default: storageConfig.storagePath,
            validate: (input: string) => input.trim().length > 0 || 'Path is required'
          }
        ]);
        this.storageManager.setStoragePath(newPath.trim());
        console.log(chalk.green(`Storage path set to: ${newPath}`));
        break;
      case 'disable':
        this.storageManager.setStorageEnabled(false);
        console.log(chalk.yellow('Storage disabled (logging also disabled)'));
        break;
      case 'enable':
        this.storageManager.setStorageEnabled(true);
        console.log(chalk.green('Storage enabled'));
        break;
      case 'open':
        const storagePath = this.storageManager.getStoragePath();
        await execa(config.editor, [storagePath]);
        console.log(chalk.green(`Opened storage path in ${config.editor}`));
        break;
    }

    await this.pressEnterToContinue();
  }

  // View Logs
  async viewLogs(): Promise<void> {
    if (!this.storageManager.isLoggingEnabled()) {
      console.log(chalk.yellow('\n[INFO] Logging is disabled'));
      await this.pressEnterToContinue();
      return;
    }

    const logs = this.logManager.getLogs(1000); // Get last 1000 entries

    if (logs.length === 0) {
      console.log(chalk.yellow('\n[INFO] No logs found'));
      await this.pressEnterToContinue();
      return;
    }

    // Fuzzy search
    const { search } = await inquirer.prompt([
      {
        type: 'input',
        name: 'search',
        message: 'Search logs (fuzzy search, press Enter for all):',
        default: ''
      }
    ]);

    let filteredLogs = logs;
    if (search.trim()) {
      const fuse = new Fuse(logs, {
        keys: ['message', 'app', 'level'],
        threshold: 0.3
      });
      filteredLogs = fuse.search(search).map(result => result.item);
    }

    // Display logs
    console.clear();
    console.log(chalk.bold.cyan('\nLogs:\n'));
    console.log(chalk.gray('─'.repeat(80)));
    
    filteredLogs.slice(-50).forEach(entry => {
      const time = new Date(entry.timestamp).toLocaleString();
      const levelColor = entry.level === 'error' ? 'red' : 
                        entry.level === 'warn' ? 'yellow' : 
                        entry.level === 'debug' ? 'gray' : 'green';
      const levelText = entry.level.toUpperCase().padEnd(5);
      const appText = entry.app ? `[${entry.app}]` : '';
      
      console.log(
        chalk.gray(`[${time}]`) + ' ' +
        chalk[levelColor](`[${levelText}]`) + ' ' +
        (appText ? chalk.blue(appText) + ' ' : '') +
        entry.message
      );
    });

    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.gray(`\nShowing ${filteredLogs.length} of ${logs.length} log entries`));
    console.log(chalk.gray('Press E to open in editor, or Enter to continue'));

    // Wait for E key or Enter
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      
      const keypressHandler = async (str: string, key: any) => {
        process.stdin.setRawMode(false);
        process.stdin.removeListener('keypress', keypressHandler);
        if (key.name === 'e' || key.name === 'E') {
          const logFile = join(this.storageManager.getLogPath(), 'cli.log');
          await execa(config.editor, [logFile]);
          console.log(chalk.green(`\nOpened logs in ${config.editor}`));
        }
        await this.pressEnterToContinue();
      };
      
      process.stdin.once('keypress', keypressHandler);
    } else {
      await this.pressEnterToContinue();
    }
  }

  // Logs Configuration
  async handleLogsConfig(): Promise<void> {
    const storageConfig = this.storageManager.getConfig();

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Logs Configuration:',
        choices: [
          { name: `Set Log Directory (Current: ${storageConfig.logPath})`, value: 'set-path' },
          { name: `Disable Logging ${storageConfig.loggingEnabled ? '' : '(Currently Disabled)'}`, value: 'disable' },
          { name: `Enable Logging ${storageConfig.loggingEnabled ? '(Currently Enabled)' : ''}`, value: 'enable' },
          { name: 'Open Logs Directory', value: 'open' },
          { name: 'Clear Logs', value: 'clear' },
          new inquirer.Separator(),
          { name: chalk.gray('← Back'), value: 'back' }
        ]
      }
    ]);

    if (action === 'back') return;

    switch (action) {
      case 'set-path':
        const { path: newPath } = await inquirer.prompt([
          {
            type: 'input',
            name: 'path',
            message: 'Enter log directory path:',
            default: storageConfig.logPath,
            validate: (input: string) => input.trim().length > 0 || 'Path is required'
          }
        ]);
        this.storageManager.setLogPath(newPath.trim());
        console.log(chalk.green(`Log directory set to: ${newPath}`));
        break;
      case 'disable':
        this.storageManager.setLoggingEnabled(false);
        console.log(chalk.yellow('Logging disabled'));
        break;
      case 'enable':
        if (!this.storageManager.isStorageEnabled()) {
          console.log(chalk.red('[ERROR] Cannot enable logging when storage is disabled'));
        } else {
          this.storageManager.setLoggingEnabled(true);
          console.log(chalk.green('Logging enabled'));
        }
        break;
      case 'open':
        const logPath = this.storageManager.getLogPath();
        await execa(config.editor, [logPath]);
        console.log(chalk.green(`Opened logs directory in ${config.editor}`));
        break;
      case 'clear':
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to clear all logs?',
            default: false
          }
        ]);
        if (confirm) {
          this.logManager.clearLogs();
          console.log(chalk.green('Logs cleared'));
        }
        break;
    }

    await this.pressEnterToContinue();
  }

  // Health Check
  async healthCheck(): Promise<void> {
    console.clear();
    console.log(chalk.bold.cyan('\nHealth Check\n'));
    console.log(chalk.gray('─'.repeat(80)));

    const checks = [];

    // Check running apps
    for (const [name, app] of this.runningApps) {
      const portInUse = await this.checkPortInUse(app.port);
      const health = portInUse ? 'healthy' : 'unhealthy';
      checks.push({
        name: app.displayName,
        status: health,
        port: app.port,
        running: true
      });
    }

    // Check configured apps
    const apps = await this.detectApps();
    for (const app of apps) {
      if (!this.runningApps.has(app.name)) {
        const portInUse = await this.checkPortInUse(app.port);
        checks.push({
          name: app.displayName,
          status: portInUse ? 'port-conflict' : 'not-running',
          port: app.port,
          running: false
        });
      }
    }

    // Display results
    checks.forEach(check => {
      const statusColor = check.status === 'healthy' ? 'green' :
                         check.status === 'port-conflict' ? 'yellow' : 'gray';
      const statusText = check.status === 'healthy' ? 'HEALTHY' :
                        check.status === 'port-conflict' ? 'PORT CONFLICT' : 'NOT RUNNING';
      
      console.log(
        chalk.white(check.name.padEnd(20)) + ' ' +
        chalk[statusColor](statusText.padEnd(15)) + ' ' +
        chalk.gray(`Port: ${check.port}`)
      );
    });

    console.log(chalk.gray('─'.repeat(80)));
    await this.pressEnterToContinue();
  }

  // Update Version
  async updateVersion(): Promise<void> {
    const packageJsonPath = path.join(__dirname, '../package.json');
    
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const currentVersion = packageJson.version;
      
      console.log(chalk.cyan(`\nCurrent version: ${chalk.bold(currentVersion)}\n`));
      
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: `Increment Patch Version (${currentVersion} -> ${this.incrementVersion(currentVersion, 'patch')})`, value: 'patch' },
            { name: `Increment Minor Version (${currentVersion} -> ${this.incrementVersion(currentVersion, 'minor')})`, value: 'minor' },
            { name: `Increment Major Version (${currentVersion} -> ${this.incrementVersion(currentVersion, 'major')})`, value: 'major' },
            { name: 'Set Custom Version', value: 'custom' },
            { name: 'Release & Publish to npm', value: 'release' },
            new inquirer.Separator(),
            { name: chalk.gray('← Back'), value: 'back' }
          ]
        }
      ]);
      
      if (action === 'back') return;
      
      let newVersion: string;
      
      if (action === 'custom') {
        const { version } = await inquirer.prompt([
          {
            type: 'input',
            name: 'version',
            message: 'Enter new version (format: x.y.z):',
            default: currentVersion,
            validate: (input: string) => {
              const versionRegex = /^\d+\.\d+\.\d+$/;
              return versionRegex.test(input) || 'Invalid version format. Use x.y.z (e.g., 1.0.0)';
            }
          }
        ]);
        newVersion = version;
      } else if (action === 'release') {
        // Run the release script
        console.log(chalk.yellow('\n🚀 Running release script...\n'));
        try {
          await execa('npm', ['run', 'release'], {
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit'
          });
          console.log(chalk.green('\n✅ Release completed successfully!'));
        } catch (error) {
          console.log(chalk.red('\n❌ Release failed. See errors above.'));
        }
        await this.pressEnterToContinue();
        return;
      } else {
        newVersion = this.incrementVersion(currentVersion, action);
      }
      
      // Update package.json
      packageJson.version = newVersion;
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
      
      console.log(chalk.green(`\n✅ Version updated to ${chalk.bold(newVersion)}`));
      this.logManager.log('info', `Version updated to ${newVersion}`);
      
      await this.pressEnterToContinue();
    } catch (error) {
      console.log(chalk.red(`\n[ERROR] Failed to update version: ${error instanceof Error ? error.message : String(error)}`));
      await this.pressEnterToContinue();
    }
  }

  // Helper to increment version
  private incrementVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
    const parts = version.split('.');
    if (parts.length !== 3) {
      throw new Error(`Invalid version format: ${version}. Expected format: x.y.z`);
    }
    
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    const patch = parseInt(parts[2], 10);
    
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      throw new Error(`Invalid version format: ${version}`);
    }
    
    switch (type) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
      default:
        throw new Error(`Invalid version type: ${type}`);
    }
  }

  // Reinstall SK
  async reinstallSK(): Promise<void> {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'This will uninstall and reinstall the CLI. Continue?',
        default: false
      }
    ]);

    if (!confirm) return;

    const storagePath = this.storageManager.getStoragePath();
    const scriptPath = join(storagePath, 'reinstall.sh');

    const script = `#!/bin/bash
# Auto-generated reinstall script
echo "Uninstalling @skriuw/sk..."
bun remove -g @skriuw/sk || npm uninstall -g @skriuw/sk || true
echo "Installing @skriuw/sk..."
cd "${this.rootDir}/tools/sk"
bun install
bun run build
echo "Reinstall complete!"
`;

    try {
      writeFileSync(scriptPath, script, 'utf-8');
      chmodSync(scriptPath, 0o755);
      
      console.log(chalk.green(`\nReinstall script created at: ${scriptPath}`));
      console.log(chalk.yellow('Executing reinstall script...\n'));
      
      await execa('bash', [scriptPath], {
        stdio: 'inherit',
        cwd: storagePath
      });
    } catch (error) {
      console.log(chalk.red(`[ERROR] Failed to create/execute reinstall script: ${error}`));
    }

    await this.pressEnterToContinue();
  }

  // Cleanup
  async cleanup(): Promise<void> {
    // Stop hotkey listener
    this.stopHotkeyListener();
    
    console.log(chalk.yellow('\n\nShutting down all apps...'));
    
    const shutdownPromises: Promise<void>[] = [];
    
    for (const [name, app] of this.runningApps) {
      console.log(chalk.gray(`Stopping ${app.displayName}...`));
      
      const shutdownPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill after 5 seconds
          app.process.kill('SIGKILL');
          resolve();
        }, 5000);
        
        app.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        app.process.kill('SIGTERM');
      });
      
      shutdownPromises.push(shutdownPromise);
    }
    
    // Wait for all processes to shutdown (max 5 seconds each)
    await Promise.all(shutdownPromises);
    
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

  // Direct dev mode (replaces bun run dev) with interactive controls
  async startDirectDev(): Promise<void> {
    const apps = await this.detectApps();
    
    if (apps.length === 0) {
      console.log(chalk.red('[ERROR] No apps detected'));
      process.exit(1);
    }

    // Single app: start it directly with interactive controls
    if (apps.length === 1) {
      const app = apps[0];
      console.log(chalk.cyan(`Starting ${app.displayName}...\n`));
      
      const appPath = path.join(this.rootDir, app.path);
      const frameworkConfig = FrameworkDetector.detect(appPath);
      const [command, ...args] = frameworkConfig.devCommand.split(' ');
      
      // Use detected port
      let port = app.port;
      if (frameworkConfig.port && frameworkConfig.port !== 3000) {
        port = frameworkConfig.port;
      }
      
      // Spawn process with captured output (for port detection)
      const proc = spawn(command, args, {
        cwd: appPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        detached: false
      });

      let detectedPort = port;
      let isReady = false;
      let lastOutputTime = Date.now();

      // Store running app for interactive controls
      const runningApp: RunningApp = {
        name: app.name,
        displayName: app.displayName,
        port: detectedPort,
        path: app.path,
        process: proc,
        color: app.color,
        framework: frameworkConfig,
        detectedPort: detectedPort
      };
      this.runningApps.set(app.name, runningApp);

      // Handle stdout - show output and detect ready/port
      proc.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        process.stdout.write(output); // Show output to user
        
        // Extract port from output
        const extractedPort = FrameworkDetector.extractPort(output, frameworkConfig.portPatterns);
        if (extractedPort && extractedPort !== detectedPort) {
          detectedPort = extractedPort;
          runningApp.port = detectedPort;
          runningApp.detectedPort = detectedPort;
        }
        
        // Check if ready
        if (FrameworkDetector.isReady(output, frameworkConfig.readyPatterns)) {
          if (!isReady) {
            isReady = true;
            this.showInteractiveStatusBar(runningApp);
          }
        }
        
        lastOutputTime = Date.now();
      });

      // Handle stderr - show errors but filter warnings
      proc.stderr?.on('data', (data: Buffer) => {
        const error = data.toString();
        // Show errors but filter common warnings
        if (!error.includes('warn') && !error.includes('info')) {
          process.stderr.write(error);
        } else {
          // Still show warnings but less prominently
          process.stderr.write(chalk.gray(error));
        }
        lastOutputTime = Date.now();
      });

      // Setup interactive hotkeys
      this.setupDirectModeHotkeys(runningApp);

      // Show initial status bar
      setTimeout(() => {
        if (!isReady) {
          this.showInteractiveStatusBar(runningApp);
        }
      }, 2000);

      // Handle cleanup
      proc.on('exit', (code) => {
        this.runningApps.delete(app.name);
        this.stopHotkeyListener();
        if (code !== 0 && code !== null) {
          console.log(chalk.red(`\n[ERROR] ${app.displayName} exited with code ${code}`));
        }
        process.exit(code || 0);
      });

      proc.on('error', (error) => {
        this.runningApps.delete(app.name);
        this.stopHotkeyListener();
        console.log(chalk.red(`\n[ERROR] Failed to start ${app.displayName}: ${error.message}`));
        process.exit(1);
      });

      // Handle SIGINT - remove any existing handler first
      if (this.sigintHandler) {
        process.removeListener('SIGINT', this.sigintHandler);
      }
      
      this.sigintHandler = () => {
        this.stopHotkeyListener();
        proc.kill('SIGTERM');
        this.runningApps.delete(app.name);
        
        // Force exit after timeout
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      };
      
      process.on('SIGINT', this.sigintHandler);

    } else {
      // Multiple apps: show menu
      console.log(chalk.yellow('[INFO] Multiple apps detected. Showing menu...\n'));
      await this.showMainMenu();
    }
  }

  // Show interactive status bar in direct mode
  showInteractiveStatusBar(app: RunningApp): void {
    // Write status bar on new lines (won't interfere with dev output)
    process.stdout.write('\n');
    process.stdout.write(chalk.gray('─'.repeat(80)) + '\n');
    process.stdout.write(
      chalk.cyan(`[${app.displayName}]`) + ' ' +
      chalk.green(`Running on http://localhost:${app.port}`) + ' | ' +
      chalk.yellow('[O]pen') + ' ' +
      chalk.yellow('[C]ode') + ' ' +
      chalk.yellow('[R]estart') + ' ' +
      chalk.yellow('[S]top') + ' ' +
      chalk.yellow('[G]it') + ' ' +
      chalk.yellow('[M]enu') + '\n'
    );
    process.stdout.write(chalk.gray('─'.repeat(80)) + '\n');
  }

  // Setup hotkeys for direct dev mode
  setupDirectModeHotkeys(app: RunningApp): void {
    if (!process.stdin.isTTY) return;

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', async (str, key) => {
      // Only handle single character keys (not Ctrl+C, etc.)
      if (key.ctrl && key.name === 'c') {
        // Let SIGINT handler deal with it
        return;
      }

      const keyName = key.name?.toLowerCase();
      
      switch (keyName) {
        case 'o':
          // Open in browser
          process.stdout.write('\n');
          await this.openInBrowserDirect(app);
          this.showInteractiveStatusBar(app);
          break;
        case 'c':
          // Open in editor
          process.stdout.write('\n');
          await this.openInEditorDirect(app);
          this.showInteractiveStatusBar(app);
          break;
        case 'r':
          // Restart
          process.stdout.write('\n');
          await this.restartAppDirect(app);
          break;
        case 's':
          // Stop
          process.stdout.write('\n');
          await this.stopAppDirect(app);
          break;
        case 'g':
          // Open repository
          process.stdout.write('\n');
          await this.openRepositoryDirect();
          this.showInteractiveStatusBar(app);
          break;
        case 'm':
          // Switch to menu mode
          process.stdout.write('\n');
          process.stdin.setRawMode(false);
          await this.showMainMenu();
          break;
      }
    });
  }

  // Direct mode versions of actions (non-blocking, minimal output)
  async openInBrowserDirect(app: RunningApp): Promise<void> {
    try {
      await open(`http://localhost:${app.port}`);
      console.log(chalk.green(`[INFO] Opened http://localhost:${app.port} in browser`));
    } catch (error) {
      console.log(chalk.red('[ERROR] Failed to open browser'));
    }
  }

  async openInEditorDirect(app: RunningApp): Promise<void> {
    try {
      const appPath = path.join(this.rootDir, app.path);
      await execa(config.editor, [appPath], { stdio: 'ignore' });
      console.log(chalk.green(`[INFO] Opened ${app.displayName} in ${config.editor}`));
    } catch (error) {
      console.log(chalk.red(`[ERROR] Failed to open ${config.editor}`));
    }
  }

  async restartAppDirect(app: RunningApp): Promise<void> {
    console.log(chalk.yellow(`[INFO] Restarting ${app.displayName}...`));
    
    // Stop current process with graceful shutdown
    app.process.kill('SIGTERM');
    
    // Wait for clean shutdown with timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        app.process.kill('SIGKILL');
        resolve();
      }, 5000);
      
      app.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    
    this.runningApps.delete(app.name);
    
    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Restart
    const apps = await this.detectApps();
    const appConfig = apps.find(a => a.name === app.name);
    if (appConfig) {
      await this.runAppDirectMode(appConfig, app);
    }
  }

  async stopAppDirect(app: RunningApp): Promise<void> {
    console.log(chalk.yellow(`[INFO] Stopping ${app.displayName}...`));
    
    app.process.kill('SIGTERM');
    
    // Wait for clean shutdown with timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        app.process.kill('SIGKILL');
        resolve();
      }, 5000);
      
      app.process.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    
    this.runningApps.delete(app.name);
    this.stopHotkeyListener();
    process.exit(0);
  }

  async openRepositoryDirect(): Promise<void> {
    try {
      const { stdout } = await execa('git', ['remote', '-v'], {
        cwd: this.rootDir,
        reject: false
      });

      const match = stdout.match(/https:\/\/[^\s]+/);
      if (match) {
        const url = match[0].replace('.git', '');
        await open(url);
        console.log(chalk.green(`[INFO] Opened repository in browser`));
      } else {
        console.log(chalk.red('[ERROR] No remote repository found'));
      }
    } catch (error) {
      console.log(chalk.red('[ERROR] Failed to get repository URL'));
    }
  }

  // Run app in direct mode (for restart)
  async runAppDirectMode(app: AppConfig, previousApp?: RunningApp): Promise<void> {
    const appPath = path.join(this.rootDir, app.path);
    const frameworkConfig = FrameworkDetector.detect(appPath);
    const [command, ...args] = frameworkConfig.devCommand.split(' ');
    
    let port = app.port;
    if (frameworkConfig.port && frameworkConfig.port !== 3000) {
      port = frameworkConfig.port;
    }
    
    const proc = spawn(command, args, {
      cwd: appPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: false
    });

    let detectedPort = port;
    let isReady = false;

    const runningApp: RunningApp = {
      name: app.name,
      displayName: app.displayName,
      port: detectedPort,
      path: app.path,
      process: proc,
      color: app.color,
      framework: frameworkConfig,
      detectedPort: detectedPort
    };
    this.runningApps.set(app.name, runningApp);

    proc.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      process.stdout.write(output);
      
      const extractedPort = FrameworkDetector.extractPort(output, frameworkConfig.portPatterns);
      if (extractedPort && extractedPort !== detectedPort) {
        detectedPort = extractedPort;
        runningApp.port = detectedPort;
        runningApp.detectedPort = detectedPort;
      }
      
      if (FrameworkDetector.isReady(output, frameworkConfig.readyPatterns)) {
        if (!isReady) {
          isReady = true;
          this.showInteractiveStatusBar(runningApp);
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const error = data.toString();
      if (!error.includes('warn') && !error.includes('info')) {
        process.stderr.write(error);
      } else {
        process.stderr.write(chalk.gray(error));
      }
    });

    this.setupDirectModeHotkeys(runningApp);

    proc.on('exit', (code) => {
      this.runningApps.delete(app.name);
      this.stopHotkeyListener();
      if (code !== 0 && code !== null) {
        console.log(chalk.red(`\n[ERROR] ${app.displayName} exited with code ${code}`));
      }
      process.exit(code || 0);
    });

    proc.on('error', (error) => {
      this.runningApps.delete(app.name);
      this.stopHotkeyListener();
      console.log(chalk.red(`\n[ERROR] Failed to start ${app.displayName}: ${error.message}`));
      process.exit(1);
    });
  }

  // Start the CLI
  async start(): Promise<void> {
    // Handle process termination - use single handler
    const signalHandler = async () => {
      await this.cleanup();
      process.exit(0);
    };
    
    // Remove any existing handlers first
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
    }
    
    this.sigintHandler = signalHandler;
    process.on('SIGINT', signalHandler);
    process.on('SIGTERM', signalHandler);

    // Show main menu
    await this.showMainMenu();
  }
}

// Start the CLI
const cli = new CLIManager();

// Check for command-line arguments for direct dev mode
const args = process.argv.slice(2);

if (args.length > 0) {
  // Direct mode: run dev without menu
  if (args[0] === 'dev' || args[0] === 'start') {
    cli.startDirectDev().catch((error) => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
  } else {
    // Show menu normally
    cli.start().catch((error) => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
  }
} else {
  // No args: show menu
  cli.start().catch((error) => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
  });
}


