/**
 * Storage and Configuration Manager
 * Handles storage path, logging configuration, and settings persistence
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface StorageConfig {
  storagePath: string;
  logPath: string;
  storageEnabled: boolean;
  loggingEnabled: boolean;
  storageType: 'sqlite' | 'json';
}

const DEFAULT_STORAGE_PATH = join(homedir(), '.config', 'sk');
const CONFIG_FILE = 'config.json';

export class StorageManager {
  private configPath: string;
  private config: StorageConfig;

  constructor() {
    this.configPath = join(DEFAULT_STORAGE_PATH, CONFIG_FILE);
    this.config = this.loadConfig();
    this.ensureDirectories();
  }

  private loadConfig(): StorageConfig {
    if (existsSync(this.configPath)) {
      try {
        const data = readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data);
        return {
          storagePath: loaded.storagePath || DEFAULT_STORAGE_PATH,
          logPath: loaded.logPath || join(loaded.storagePath || DEFAULT_STORAGE_PATH, 'logs'),
          storageEnabled: loaded.storageEnabled !== false,
          loggingEnabled: loaded.loggingEnabled !== false,
          storageType: loaded.storageType || 'json'
        };
      } catch (error) {
        return this.getDefaultConfig();
      }
    }
    return this.getDefaultConfig();
  }

  private getDefaultConfig(): StorageConfig {
    return {
      storagePath: DEFAULT_STORAGE_PATH,
      logPath: join(DEFAULT_STORAGE_PATH, 'logs'),
      storageEnabled: true,
      loggingEnabled: true,
      storageType: 'json'
    };
  }

  private ensureDirectories(): void {
    if (this.config.storageEnabled) {
      if (!existsSync(this.config.storagePath)) {
        mkdirSync(this.config.storagePath, { recursive: true });
      }
      if (this.config.loggingEnabled && !existsSync(this.config.logPath)) {
        mkdirSync(this.config.logPath, { recursive: true });
      }
    }
  }

  private saveConfig(): void {
    try {
      if (!existsSync(DEFAULT_STORAGE_PATH)) {
        mkdirSync(DEFAULT_STORAGE_PATH, { recursive: true });
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  getStoragePath(): string {
    return this.config.storagePath;
  }

  getLogPath(): string {
    return this.config.logPath;
  }

  isStorageEnabled(): boolean {
    return this.config.storageEnabled;
  }

  isLoggingEnabled(): boolean {
    return this.config.loggingEnabled && this.config.storageEnabled;
  }

  getStorageType(): 'sqlite' | 'json' {
    return this.config.storageType;
  }

  setStoragePath(path: string): void {
    this.config.storagePath = path;
    this.config.logPath = join(path, 'logs');
    this.ensureDirectories();
    this.saveConfig();
  }

  setLogPath(path: string): void {
    this.config.logPath = path;
    this.ensureDirectories();
    this.saveConfig();
  }

  setStorageEnabled(enabled: boolean): void {
    this.config.storageEnabled = enabled;
    if (!enabled) {
      this.config.loggingEnabled = false;
    }
    this.saveConfig();
  }

  setLoggingEnabled(enabled: boolean): void {
    if (!this.config.storageEnabled && enabled) {
      throw new Error('Cannot enable logging when storage is disabled');
    }
    this.config.loggingEnabled = enabled;
    this.ensureDirectories();
    this.saveConfig();
  }

  setStorageType(type: 'sqlite' | 'json'): void {
    this.config.storageType = type;
    this.saveConfig();
  }

  getConfig(): StorageConfig {
    return { ...this.config };
  }
}

