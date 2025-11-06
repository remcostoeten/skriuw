#!/usr/bin/env bun

import 'dotenv/config';
import { init } from '@instantdb/react';
import { schema, type Schema } from '../../../apps/instantdb/src/api/db/schema.ts';
import inquirer from 'inquirer';
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

// Fetch all tasks
async function fetchTasks(): Promise<any[]> {
  const result = await query({
    tasks: {
      $: {
        order: { createdAt: 'desc' },
      },
    },
  });
  return (result?.tasks as any[]) || [];
}

// Fetch all folders
async function fetchFolders(): Promise<any[]> {
  const result = await query({
    folders: {
      parent: {},
    },
  });
  const folders = (result?.folders as any[]) || [];
  return folders.sort((a: any, b: any) => a.name.localeCompare(b.name));
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

// Reposition notes - update positions when inserting at custom position
async function updateNotePositions(
  folderId: string | null | undefined,
  newPosition: number,
  excludeNoteId?: string
): Promise<void> {
  const notes = await fetchNotes(folderId);
  const notesToUpdate = notes.filter((n: any) => {
    if (excludeNoteId && n.id === excludeNoteId) return false;
    return (n.position || 0) >= newPosition;
  });

  if (notesToUpdate.length === 0) return;

  const transactions = notesToUpdate.map((note: any) =>
    tx.notes[note.id].update({ position: (note.position || 0) + 1 })
  );

  await transact(transactions);
}

// Move a note to a new position
async function moveNote() {
  console.log(chalk.cyan.bold('\n📦 Move Note\n'));

  const notes = await fetchNotes();
  if (notes.length === 0) {
    console.log(chalk.yellow('No notes found.'));
    return;
  }

  const { noteId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'noteId',
      message: 'Select note to move:',
      choices: notes.map((n: any) => ({
        name: `${n.title}${n.pinned ? ' 📌' : ''}`,
        value: n.id,
      })),
    },
  ]);

  const selectedNote = notes.find((n: any) => n.id === noteId);
  if (!selectedNote) return;

  const currentFolderId = (selectedNote.folder as any)?.id || null;
  const folders = await fetchFolders();

  const { newFolderId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'newFolderId',
      message: 'Select target folder:',
      choices: (() => {
        const buildFolderTree = (folders: any[], parentId: string | null = null, depth = 0): any[] => {
          const children = folders.filter((f: any) => {
            const fParentId = (f.parent as any)?.id || null;
            return fParentId === parentId;
          });
          return children.flatMap((f: any) => {
            const indent = '  '.repeat(depth);
            const item = { name: `${indent}${f.name}`, value: f.id };
            const subItems = buildFolderTree(folders, f.id, depth + 1);
            return [item, ...subItems];
          });
        };
        return [
          { name: 'Root (no folder)', value: null },
          ...buildFolderTree(folders),
        ];
      })(),
    },
  ]);

  const targetNotes = await fetchNotes(newFolderId);
  const { newPosition } = await inquirer.prompt([
    {
      type: 'list',
      name: 'newPosition',
      message: 'Select position:',
      choices: [
        { name: 'Top (position 0)', value: 0 },
        ...targetNotes
          .filter((n: any) => n.id !== noteId)
          .map((n: any, idx: number) => ({
            name: `After "${n.title}" (position ${n.position})`,
            value: n.position + 1,
          })),
        { name: 'End', value: -1 },
      ],
    },
  ]);

  const spinner = ora('Moving note...').start();

  let finalPosition = newPosition;
  if (newPosition === -1) {
    finalPosition = calculatePosition(targetNotes.filter((n: any) => n.id !== noteId), newFolderId);
  } else {
    // Shift other notes
    await updateNotePositions(newFolderId, newPosition, noteId);
  }

  const transactions = [tx.notes[noteId].update({ position: finalPosition })];

  // Update folder if changed
  if (currentFolderId !== newFolderId) {
    if (newFolderId) {
      // Link to new folder
      if (currentFolderId) {
        // Unlink from current folder first
        transactions.push(tx.notes[noteId].unlink({ folder: currentFolderId }));
      }
      transactions.push(tx.notes[noteId].link({ folder: newFolderId }));
    } else if (currentFolderId) {
      // Unlink from folder (move to root)
      transactions.push(tx.notes[noteId].unlink({ folder: currentFolderId }));
    }
  }

  await transact(transactions);
  spinner.succeed(chalk.green('Note moved successfully!'));
}

async function seedNote() {
  console.log(chalk.cyan.bold('\n🌱 Seed New Note\n'));

  try {
    // Prompt for title
    const { title } = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Note title:',
        validate: (input) => input.trim().length > 0 || 'Title is required',
      },
    ]);

    // Prompt for created at date
    const { createdAtStr } = await inquirer.prompt([
      {
        type: 'input',
        name: 'createdAtStr',
        message: 'Created at date (dd-mm-yyyy):',
        validate: (input) => {
          try {
            parseDutchDate(input);
            return true;
          } catch {
            return 'Invalid date format. Use dd-mm-yyyy';
          }
        },
      },
    ]);

    const createdAt = parseDutchDate(createdAtStr);
    const updatedAt = Date.now();

    // Prompt for content source
    const { contentSource } = await inquirer.prompt([
      {
        type: 'list',
        name: 'contentSource',
        message: 'Content source:',
        choices: [
          { name: 'From .md or .mdx file', value: 'file' },
          { name: 'Paste markdown content', value: 'paste' },
        ],
      },
    ]);

    let content = '';
    if (contentSource === 'file') {
      const { filePath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'filePath',
          message: 'Path to .md or .mdx file:',
          validate: (input) => input.trim().length > 0 || 'File path is required',
        },
      ]);
      content = await readMarkdownFile(filePath);
    } else {
      const { pastedContent } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'pastedContent',
          message: 'Paste your markdown content (opens editor):',
        },
      ]);
      content = pastedContent;
    }

    // Prompt for pinned
    const { pinned } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'pinned',
        message: 'Pin this note?',
        default: false,
      },
    ]);

    let position = 0;
    let folderId: string | null = null;

    if (pinned) {
      position = 0;
    } else {
      // Ask about folder
      const folders = await fetchFolders();
      const { useFolder } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useFolder',
          message: 'Place in a folder?',
          default: false,
        },
      ]);

      if (useFolder) {
        if (folders.length === 0) {
          console.log(chalk.yellow('No folders available. Creating note in root.'));
        } else {
          // Build folder tree for display
          const buildFolderTree = (folders: any[], parentId: string | null = null, depth = 0): any[] => {
            const children = folders.filter((f: any) => {
              const fParentId = (f.parent as any)?.id || null;
              return fParentId === parentId;
            });
            return children.flatMap((f: any) => {
              const indent = '  '.repeat(depth);
              const item = { name: `${indent}${f.name}`, value: f.id };
              const subItems = buildFolderTree(folders, f.id, depth + 1);
              return [item, ...subItems];
            });
          };

          const { selectedFolderId } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedFolderId',
              message: 'Select folder:',
              choices: [
                { name: 'Root (no folder)', value: null },
                ...buildFolderTree(folders),
              ],
            },
          ]);
          folderId = selectedFolderId;
        }
      }

      // Ask about custom position
      const { useCustomPosition } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useCustomPosition',
          message: 'Use custom position?',
          default: false,
        },
      ]);

      if (useCustomPosition) {
        const { customPos } = await inquirer.prompt([
          {
            type: 'number',
            name: 'customPos',
            message: 'Position (number):',
            validate: (input) => !isNaN(input) || 'Position must be a number',
          },
        ]);
        position = customPos;
        // Shift other notes to make room
        await updateNotePositions(folderId, position);
      } else {
        // Calculate position at end
        const notes = await fetchNotes(folderId);
        position = calculatePosition(notes, folderId);
      }
    }

    // Ask about tasks
    const tasks = await fetchTasks();
    let selectedTaskIds: string[] = [];
    if (tasks.length > 0) {
      const { addTasks } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addTasks',
          message: 'Link existing tasks to this note?',
          default: false,
        },
      ]);

      if (addTasks) {
        const { taskIds } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'taskIds',
            message: 'Select tasks:',
            choices: tasks.map((t: any) => ({
              name: `${t.content.substring(0, 50)}${t.content.length > 50 ? '...' : ''}`,
              value: t.id,
            })),
          },
        ]);
        selectedTaskIds = taskIds || [];
      }
    }

    // Create the note
    const spinner = ora('Creating note...').start();
    const noteId = generateIdNode();

    const transactions = [
      tx.notes[noteId].update({
        title,
        content,
        position,
        pinned: pinned || undefined,
        createdAt,
        updatedAt,
      }),
    ];

    if (folderId) {
      transactions.push(tx.notes[noteId].link({ folder: folderId }));
    }

    // Link tasks (tasks link to notes, not the reverse)
    for (const taskId of selectedTaskIds) {
      transactions.push(tx.tasks[taskId].link({ note: noteId }));
    }

    await transact(transactions);

    spinner.succeed(chalk.green(`Note "${title}" created successfully!`));
    console.log(chalk.cyan(`\nNote ID: ${noteId}`));
    console.log(chalk.cyan(`Position: ${position}`));
    if (folderId) {
      console.log(chalk.cyan(`Folder: ${folderId}`));
    }
    if (selectedTaskIds.length > 0) {
      console.log(chalk.cyan(`Linked tasks: ${selectedTaskIds.length}`));
    }
  } catch (error) {
    console.error(chalk.red('\nError:'), error);
    process.exit(1);
  }
}

async function main() {
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '🌱 Seed a new note', value: 'seed' },
        { name: '📦 Move/reposition an existing note', value: 'move' },
      ],
    },
  ]);

  if (action === 'seed') {
    await seedNote();
  } else if (action === 'move') {
    await moveNote();
  }
}

main();
