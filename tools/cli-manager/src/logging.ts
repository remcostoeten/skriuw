/**
 * Logging Manager
 * Handles log file creation, reading, and management
 */

import { appendFileSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { StorageManager } from './storage.js';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  app?: string;
}

export class LogManager {
  private storageManager: StorageManager;
  private logFile: string;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
    this.logFile = join(storageManager.getLogPath(), 'cli.log');
  }

  log(level: LogEntry['level'], message: string, app?: string): void {
    if (!this.storageManager.isLoggingEnabled()) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      app
    };

    const logLine = this.formatLogEntry(entry);
    
    try {
      appendFileSync(this.logFile, logLine + '\n', 'utf-8');
    } catch (error) {
      // Silently fail if logging is not available
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.app ? ` [${entry.app}]` : ''} ${entry.message}`;
  }

  getLogs(limit?: number): LogEntry[] {
    if (!this.storageManager.isLoggingEnabled() || !existsSync(this.logFile)) {
      return [];
    }

    try {
      const content = readFileSync(this.logFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      const entries: LogEntry[] = [];

      for (const line of lines) {
        const match = line.match(/\[([^\]]+)\] \[([^\]]+)\](?: \[([^\]]+)\])? (.+)/);
        if (match) {
          entries.push({
            timestamp: match[1],
            level: match[2].toLowerCase() as LogEntry['level'],
            app: match[3],
            message: match[4]
          });
        }
      }

      return limit ? entries.slice(-limit) : entries;
    } catch (error) {
      return [];
    }
  }

  clearLogs(): void {
    if (existsSync(this.logFile)) {
      writeFileSync(this.logFile, '', 'utf-8');
    }
  }

  getLogDirectory(): string {
    return this.storageManager.getLogPath();
  }

  getAllLogFiles(): string[] {
    try {
      const logDir = this.getLogDirectory();
      if (!existsSync(logDir)) {
        return [];
      }
      return readdirSync(logDir)
        .filter((file: string) => file.endsWith('.log'))
        .map((file: string) => join(logDir, file));
    } catch (error) {
      return [];
    }
  }

  formatLogsForDisplay(logs: LogEntry[]): string {
    return logs.map(entry => {
      const time = new Date(entry.timestamp).toLocaleString();
      const levelColor = entry.level === 'error' ? 'red' : 
                        entry.level === 'warn' ? 'yellow' : 
                        entry.level === 'debug' ? 'gray' : 'green';
      return `[${time}] [${entry.level.toUpperCase()}]${entry.app ? ` [${entry.app}]` : ''} ${entry.message}`;
    }).join('\n');
  }
}

