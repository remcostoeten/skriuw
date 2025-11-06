/**
 * Framework Detection and Configuration
 * Auto-detects Vite, Vinxi, Next.js and configures accordingly
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type Framework = 'vite' | 'vinxi' | 'nextjs' | 'unknown';

export interface FrameworkConfig {
  framework: Framework;
  devCommand: string;
  buildCommand: string;
  port: number;
  readyPatterns: RegExp[];
  portPatterns: RegExp[];
}

export class FrameworkDetector {
  static detect(projectPath: string): FrameworkConfig {
    const packageJsonPath = join(projectPath, 'package.json');
    const viteConfigPath = join(projectPath, 'vite.config.ts');
    const viteConfigJsPath = join(projectPath, 'vite.config.js');
    const nextConfigPath = join(projectPath, 'next.config.ts');
    const nextConfigJsPath = join(projectPath, 'next.config.js');
    const nextConfigMjsPath = join(projectPath, 'next.config.mjs');
    const vinxiConfigPath = join(projectPath, 'vinxi.config.ts');
    const appRouterPath = join(projectPath, 'app');
    const pagesRouterPath = join(projectPath, 'pages');

    let framework: Framework = 'unknown';
    let devCommand = 'bun run dev';
    let buildCommand = 'bun run build';
    let port = 3000;
    let readyPatterns: RegExp[] = [];
    let portPatterns: RegExp[] = [];

    // Check package.json for scripts and dependencies
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const scripts = packageJson.scripts || {};
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        // Detect Next.js
        if (deps.next || existsSync(nextConfigPath) || existsSync(nextConfigJsPath) || existsSync(nextConfigMjsPath) || existsSync(appRouterPath) || existsSync(pagesRouterPath)) {
          framework = 'nextjs';
          devCommand = scripts.dev || 'next dev';
          buildCommand = scripts.build || 'next build';
          port = 3000;
          readyPatterns = [
            /ready/i,
            /started server/i,
            /Local:\s+http/i,
            /compiled successfully/i
          ];
          portPatterns = [
            /Local:\s+http:\/\/localhost:(\d+)/i,
            /ready on http:\/\/localhost:(\d+)/i,
            /started server on.*:(\d+)/i
          ];
        }
        // Detect Vinxi
        else if (deps.vinxi || existsSync(vinxiConfigPath)) {
          framework = 'vinxi';
          devCommand = scripts.dev || 'vinxi dev';
          buildCommand = scripts.build || 'vinxi build';
          port = 3000;
          readyPatterns = [
            /ready/i,
            /VITE.*ready/i,
            /Local:\s+http/i,
            /compiled/i
          ];
          portPatterns = [
            /Local:\s+http:\/\/localhost:(\d+)/i,
            /VITE.*http:\/\/localhost:(\d+)/i,
            /http:\/\/.*:(\d+)/i
          ];
        }
        // Detect Vite
        else if (deps.vite || existsSync(viteConfigPath) || existsSync(viteConfigJsPath)) {
          framework = 'vite';
          devCommand = scripts.dev || 'vite';
          buildCommand = scripts.build || 'vite build';
          port = 5173; // Vite default
          readyPatterns = [
            /VITE.*ready/i,
            /Local:\s+http/i,
            /ready in/i
          ];
          portPatterns = [
            /Local:\s+http:\/\/localhost:(\d+)/i,
            /VITE.*http:\/\/localhost:(\d+)/i
          ];
        }
        // Fallback: use package.json scripts
        else {
          devCommand = scripts.dev || 'bun run dev';
          buildCommand = scripts.build || 'bun run build';
          
          // Try to detect port from dev script
          if (scripts.dev) {
            const portMatch = scripts.dev.match(/(?:--port|--port=|-p)\s*(\d+)/);
            if (portMatch) {
              port = parseInt(portMatch[1], 10);
            }
          }
          
          readyPatterns = [
            /ready/i,
            /started/i,
            /Local:\s+http/i,
            /listening/i
          ];
          portPatterns = [
            /localhost:(\d+)/i,
            /:\/\/.*:(\d+)/i
          ];
        }
      } catch (error) {
        // If package.json parsing fails, use defaults
      }
    }

    return {
      framework,
      devCommand,
      buildCommand,
      port,
      readyPatterns,
      portPatterns
    };
  }

  static extractPort(output: string, patterns: RegExp[]): number | null {
    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  }

  static isReady(output: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(output));
  }
}

