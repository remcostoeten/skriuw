/**
 * SK Configuration
 * 
 * Modify this file to customize your project's apps, commands, and tools
 */

export interface AppConfig {
  name: string;
  displayName: string;
  path: string;
  dev: string;
  build: string;
  port: number;
  color: string;
  deployUrl?: string; // Optional deploy URL
}

export interface ToolConfig {
  name: string;
  displayName: string;
  path: string;
  command: string;
  description?: string;
  color?: string;
}

export interface Config {
  apps: AppConfig[];
  tools?: ToolConfig[]; // Optional custom tools
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
      port: 6969,
      color: '#10b981', // green
      deployUrl: 'https://docs-skriuw.vercel.app'
    }
  ],
  tools: [
    {
      name: 'seeder',
      displayName: 'Database Seeder',
      path: './tools/seeder',
      command: 'bun run start',
      description: 'Seed the database with sample data',
      color: '#8b5cf6' // purple
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

