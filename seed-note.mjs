#!/usr/bin/env node

import 'dotenv/config';
import { init } from '@instantdb/react';
import { schema } from './apps/web/src/api/db/schema.js';
import { readFile } from 'fs/promises';
import crypto from 'crypto';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

if (!APP_ID) {
  console.error('Error: NEXT_PUBLIC_INSTANT_APP_ID is not defined in environment');
  process.exit(1);
}

const db = init({
  appId: APP_ID,
  schema,
});

const { transact, tx } = db;

// Simple seeding function
async function seedNote(title, filePath) {
  try {
    // Read markdown content
    const content = await readFile(filePath, 'utf-8');
    const noteId = crypto.randomUUID();
    const createdAt = Date.now();
    const updatedAt = Date.now();

    console.log(`Creating note: ${title}`);
    console.log(`Content length: ${content.length} characters`);

    // Create the note transaction
    const transaction = tx.notes[noteId].update({
      title,
      content,
      position: 0,
      createdAt,
      updatedAt,
    });

    await transact([transaction]);

    console.log(`✅ Note "${title}" created successfully!`);
    console.log(`📝 Note ID: ${noteId}`);
    console.log(`📅 Created: ${new Date(createdAt).toLocaleDateString()}`);

    return noteId;
  } catch (error) {
    console.error('❌ Error creating note:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node seed-note.mjs <title> <markdown-file>');
  console.log('Example: node seed-note.mjs "My Note" ./sample-note.md');
  process.exit(1);
}

const title = args[0];
const filePath = args[1];

seedNote(title, filePath);