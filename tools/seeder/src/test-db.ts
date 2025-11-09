#!/usr/bin/env bun

import 'dotenv/config';
import { init } from '@instantdb/react';
import { schema, type Schema } from '../../../apps/web/src/api/db/schema.ts';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

if (!APP_ID) {
  console.error('Error: NEXT_PUBLIC_INSTANT_APP_ID is not defined in environment');
  process.exit(1);
}

const db = init<Schema>({
  appId: APP_ID,
  schema,
});

const { transact, tx, query } = db;

async function testDB() {
  try {
    console.log('Testing database connection...');

    // Create a simple test note first
    const noteId = crypto.randomUUID();
    const now = Date.now();

    console.log('Creating test note...');
    await transact([
      tx.notes[noteId].update({
        title: 'Test Note',
        content: '# Test Content\n\nThis is a test.',
        position: 999,
        createdAt: now,
        updatedAt: now,
      })
    ]);

    console.log('✅ Test note created successfully!');
    console.log(`Note ID: ${noteId}`);

    // Try to query after creating
    console.log('Testing query...');
    const result = await query({ notes: {} });
    console.log('Query successful! Found notes:', result?.notes?.length || 0);

  } catch (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }
}

testDB();