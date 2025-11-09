#!/usr/bin/env bun

import 'dotenv/config';
import { init } from '@instantdb/react';
import { schema, type Schema } from '../../../apps/web/src/api/db/schema.ts';
import chalk from 'chalk';
import ora from 'ora';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

if (!APP_ID) {
  console.error(chalk.red('Error: NEXT_PUBLIC_INSTANT_APP_ID is not defined in environment'));
  process.exit(1);
}

const db = init<Schema>({
  appId: APP_ID,
  schema,
});

const { transact, tx, query } = db;

// Helper to generate ID (using crypto in Node.js)
function generateIdNode(): string {
  return crypto.randomUUID();
}

// Parse Dutch date format (dd-mm-yyyy) to timestamp
function parseDutchDate(dateStr: string): number {
  const [day, month, year] = dateStr.split('-').map(Number);
  if (!day || !month || !year) {
    throw new Error('Invalid date format. Use dd-mm-yyyy');
  }
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }
  return date.getTime();
}

// Read markdown file
async function readMarkdownFile(filePath: string): Promise<string> {
  try {
    const resolvedPath = resolve(process.cwd(), filePath);
    const content = await readFile(resolvedPath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${filePath}`);
  }
}

// Fetch all notes for position calculation
async function fetchNotes(folderId?: string | null): Promise<any[]> {
  const queryObj: any = {
    notes: {
      $: {
        order: { position: 'asc' },
      },
      folder: {},
    },
  };

  if (folderId !== undefined) {
    if (folderId === null) {
      // Fetch notes without folder
      queryObj.notes.$ = {
        ...queryObj.notes.$,
        where: { 'folder.id': null },
      };
    } else {
      // Fetch notes in specific folder
      queryObj.notes.$ = {
        ...queryObj.notes.$,
        where: { 'folder.id': folderId },
      };
    }
  }

  const result = await query(queryObj);
  return (result?.notes as any[]) || [];
}

// Calculate next position for a note
function calculatePosition(
  existingNotes: any[],
  folderId: string | null | undefined,
  customPosition?: number
): number {
  if (customPosition !== undefined) {
    return customPosition;
  }

  // Notes are already filtered by folder in fetchNotes
  if (existingNotes.length === 0) {
    return 0;
  }

  const maxPosition = Math.max(...existingNotes.map((n: any) => n.position || 0));
  return maxPosition + 1;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options: any = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--title':
      case '-t':
        options.title = args[++i];
        break;
      case '--file':
      case '-f':
        options.file = args[++i];
        break;
      case '--date':
      case '-d':
        options.date = args[++i];
        break;
      case '--pinned':
      case '-p':
        options.pinned = true;
        break;
      case '--folder':
        options.folder = args[++i];
        break;
      case '--position':
        options.position = parseInt(args[++i]);
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(chalk.red(`Unknown option: ${arg}`));
          process.exit(1);
        }
        break;
    }
  }

  // Validate required arguments
  if (!options.title || !options.file) {
    console.error(chalk.red('Error: --title and --file are required'));
    showHelp();
    process.exit(1);
  }

  // Set default date if not provided
  if (!options.date) {
    options.date = new Date().toLocaleDateString('nl-NL').replace(/\//g, '-');
  }

  return options;
}

function showHelp() {
  console.log(chalk.cyan.bold('\n🌱 CLI Note Seeder\n'));
  console.log('Usage: bun run seed-cli.ts [options]\n');
  console.log('Options:');
  console.log('  -t, --title <title>     Note title (required)');
  console.log('  -f, --file <path>       Path to markdown file (required)');
  console.log('  -d, --date <date>       Created at date in dd-mm-yyyy format (default: today)');
  console.log('  -p, --pinned           Pin the note (position 0)');
  console.log('  --folder <id>          Folder ID (optional)');
  console.log('  --position <number>    Custom position (optional)');
  console.log('  -h, --help              Show this help\n');
  console.log('Examples:');
  console.log('  bun run seed-cli.ts -t "My Note" -f ./note.md');
  console.log('  bun run seed-cli.ts -t "Pinned Note" -f ./note.md --pinned');
  console.log('  bun run seed-cli.ts -t "Dated Note" -f ./note.md -d "01-01-2024"');
}

async function seedNote(options: any) {
  console.log(chalk.cyan.bold('\n🌱 Seeding Note...\n'));

  try {
    const createdAt = parseDutchDate(options.date);
    const updatedAt = Date.now();

    // Read markdown content
    const content = await readMarkdownFile(options.file);
    console.log(chalk.gray(`✓ Read file: ${options.file}`));

    // Calculate position
    let position = 0;
    let folderId = options.folder || null;

    if (options.pinned) {
      position = 0;
    } else {
      const notes = await fetchNotes(folderId);
      position = calculatePosition(notes, folderId, options.position);
    }

    console.log(chalk.gray(`✓ Calculated position: ${position}`));

    // Create the note
    const spinner = ora('Creating note...').start();
    const noteId = generateIdNode();

    const transactions = [
      tx.notes[noteId].update({
        title: options.title,
        content,
        position,
        pinned: options.pinned || undefined,
        createdAt,
        updatedAt,
      }),
    ];

    if (folderId) {
      transactions.push(tx.notes[noteId].link({ folder: folderId }));
    }

    await transact(transactions);

    spinner.succeed(chalk.green(`Note "${options.title}" created successfully!`));
    console.log(chalk.cyan(`\nNote ID: ${noteId}`));
    console.log(chalk.cyan(`Position: ${position}`));
    console.log(chalk.cyan(`Created: ${new Date(createdAt).toLocaleDateString()}`));
    if (folderId) {
      console.log(chalk.cyan(`Folder: ${folderId}`));
    }
  } catch (error) {
    console.error(chalk.red('\nError:'), error);
    process.exit(1);
  }
}

async function main() {
  const options = parseArgs();
  await seedNote(options);
}

main();