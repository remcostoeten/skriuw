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

function validateConfig(config: Config): void {
  if (!Array.isArray(config.apps)) {
    throw new Error('Config.apps must be an array');
  }

  for (const app of config.apps) {
    if (!app.name || typeof app.name !== 'string') {
      throw new Error('App must have a name (string)');
    }
    if (!app.displayName || typeof app.displayName !== 'string') {
      throw new Error(`App "${app.name}" must have a displayName (string)`);
    }
    if (!app.path || typeof app.path !== 'string') {
      throw new Error(`App "${app.name}" must have a path (string)`);
    }
    if (!app.dev || typeof app.dev !== 'string') {
      throw new Error(`App "${app.name}" must have a dev command (string)`);
    }
    if (!app.build || typeof app.build !== 'string') {
      throw new Error(`App "${app.name}" must have a build command (string)`);
    }
    if (typeof app.port !== 'number' || app.port < 1 || app.port > 65535) {
      throw new Error(`App "${app.name}" must have a valid port (1-65535)`);
    }
    if (!app.color || typeof app.color !== 'string') {
      throw new Error(`App "${app.name}" must have a color (string)`);
    }
  }

  if (config.tools && !Array.isArray(config.tools)) {
    throw new Error('Config.tools must be an array if provided');
  }

  if (config.tools) {
    for (const tool of config.tools) {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new Error('Tool must have a name (string)');
      }
      if (!tool.displayName || typeof tool.displayName !== 'string') {
        throw new Error(`Tool "${tool.name}" must have a displayName (string)`);
      }
      if (!tool.path || typeof tool.path !== 'string') {
        throw new Error(`Tool "${tool.name}" must have a path (string)`);
      }
      if (!tool.command || typeof tool.command !== 'string') {
        throw new Error(`Tool "${tool.name}" must have a command (string)`);
      }
    }
  }

  if (!config.editor || typeof config.editor !== 'string') {
    throw new Error('Config must have an editor (string)');
  }

  if (!config.deploy || typeof config.deploy.staging !== 'string' || typeof config.deploy.production !== 'string') {
    throw new Error('Config must have deploy.staging and deploy.production (strings)');
  }

  if (!Array.isArray(config.logo)) {
    throw new Error('Config.logo must be an array of strings');
  }
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

// Validate config on load
try {
  validateConfig(config);
} catch (error) {
  console.error('Configuration error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
