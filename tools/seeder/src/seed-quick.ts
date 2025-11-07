#!/usr/bin/env bun

import 'dotenv/config';
import { init } from '@instantdb/react';
import { schema, type Schema } from '../../../apps/instantdb/src/api/db/schema.ts';
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

const { transact, tx } = db;

// Helper to generate ID (using crypto in Node.js)
function generateIdNode(): string {
  return crypto.randomUUID();
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

// Quick seed function
async function quickSeed(title: string, filePath: string) {
  console.log(chalk.cyan.bold('\n🌱 Quick Seeding...\n'));

  try {
    const createdAt = Date.now(); // Use current timestamp
    const updatedAt = Date.now();

    // Read markdown content
    const content = await readMarkdownFile(filePath);
    console.log(chalk.gray(`✓ Read file: ${filePath}`));

    // Create the note at position 0 (pinned)
    const position = 0;
    const pinned = true;

    console.log(chalk.gray(`✓ Creating note at position: ${position}`));

    // Create the note
    const spinner = ora('Creating note...').start();
    const noteId = generateIdNode();

    const transaction = tx.notes[noteId].update({
      title,
      content,
      position,
      pinned,
      createdAt,
      updatedAt,
    });

    await transact([transaction]);

    spinner.succeed(chalk.green(`Note "${title}" created successfully!`));
    console.log(chalk.cyan(`\nNote ID: ${noteId}`));
    console.log(chalk.cyan(`Position: ${position} (pinned)`));
    console.log(chalk.cyan(`Created: ${new Date(createdAt).toLocaleDateString()}`));

    return noteId;
  } catch (error) {
    console.error(chalk.red('\nError:'), error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: bun run seed-quick.ts <title> <markdown-file>');
  console.log('Example: bun run seed-quick.ts "My Note" ./sample.md');
  process.exit(1);
}

const title = args[0];
const filePath = args[1];

quickSeed(title, filePath);