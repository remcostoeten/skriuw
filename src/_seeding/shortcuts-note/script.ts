/**
 * Backend script for seeding the keyboard shortcuts note
 * Run with: npx tsx src/_seeding/shortcuts-note/script.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../../../.env') });

import { init } from '@instantdb/core';
import { schema } from '@/api/db/schema';
import { SHORTCUTS_NOTE_CONTENT } from './content';

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

if (!APP_ID) {
    console.error('❌ NEXT_PUBLIC_INSTANT_APP_ID is not defined in .env file');
    console.error('💡 Make sure you have a .env file with NEXT_PUBLIC_INSTANT_APP_ID set');
    process.exit(1);
}

console.log('🔑 InstantDB App ID:', APP_ID);

// Initialize the database client
const db = init({
    appId: APP_ID,
    schema,
});

const { transact, tx } = db;

// Generate UUID
function generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function seedShortcutsNote() {
    try {
        console.log('🚀 Starting database seeding for Keyboard Shortcuts note...');
        console.log('📡 Connecting to InstantDB...');

        const id = generateId();
        const now = Date.now();

        console.log(`📝 Creating note with ID: ${id}`);

        await transact([
            tx.notes[id].update({
                title: 'Keyboard Shortcuts',
                content: SHORTCUTS_NOTE_CONTENT,
                position: 0,
                pinned: false,
                createdAt: now,
                updatedAt: now,
            })
        ]);

        console.log('✅ Successfully created Keyboard Shortcuts note!');
        console.log(`🆔 Note ID: ${id}`);
        console.log('📋 Title: "Keyboard Shortcuts"');
        console.log('📍 Position: 0 (top of list)');
        console.log('🎉 Seeding completed successfully!');

        return { id, title: 'Keyboard Shortcuts' };

    } catch (error) {
        console.error('❌ Failed to seed note:', error);

        if (error instanceof Error) {
            console.error('Error details:', error.message);
            console.error('Stack:', error.stack);
        }

        console.log('\n🔄 Troubleshooting tips:');
        console.log('1. Make sure your .env file contains NEXT_PUBLIC_INSTANT_APP_ID');
        console.log('2. Verify your InstantDB app is active and accessible');
        console.log('3. Check your internet connection');
        console.log('4. Make sure you have the correct permissions');

        process.exit(1);
    }
}

// Run the seeding script
seedShortcutsNote()
    .then(() => {
        console.log('🎉 Database seeding completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Seeding script failed:', error);
        process.exit(1);
    });

