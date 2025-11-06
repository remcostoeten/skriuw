/**
 * CLI Manager Configuration
 * 
 * Modify this file to customize your project's apps and commands
 */

export interface AppConfig {
  name: string;
  displayName: string;
  path: string;
  dev: string;
  build: string;
  port: number;
  color: string;
}

export interface Config {
  apps: AppConfig[];
  editor: string;
  deploy: {
    staging: string;
    production: string;
  };
  logo: string[];
}

export const config: Config = {
  apps: [
    {
      name: 'instantdb',
      displayName: 'Tauri App',
      path: './apps/instantdb',
      dev: 'bun run dev',
      build: 'bun run build && bun run tauri:build',
      port: 42069,
      color: '#3b82f6' // blue
    },
    {
      name: 'docs',
      displayName: 'Docs App',
      path: './apps/docs',
      dev: 'bun run dev',
      build: 'bun run build',
      port: 3000,
      color: '#10b981' // green
    }
  ],
  editor: 'cursor',
  deploy: {
    staging: 'vercel deploy',
    production: 'vercel deploy --prod'
  },
  logo: [
    '╔═══════════════════════════════════════╗',
    '║                                       ║',
    '║     ███████ ██   ██ ██████  ██       ║',
    '║     ██      ██  ██  ██   ██ ██       ║',
    '║     ███████ █████   ██████  ██       ║',
    '║          ██ ██  ██  ██   ██ ██       ║',
    '║     ███████ ██   ██ ██   ██ ██       ║',
    '║                                       ║',
    '║         Project Manager v1.0          ║',
    '║                                       ║',
    '╚═══════════════════════════════════════╝'
  ]
};

