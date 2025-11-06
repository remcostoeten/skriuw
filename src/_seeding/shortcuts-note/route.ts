/**
 * API Route for seeding the keyboard shortcuts note
 * Usage: POST /api/seed/shortcuts-note
 */

import { NextRequest, NextResponse } from 'next/server';
import { seedKeyboardShortcutsNote } from './seed';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const { pinned = false, position = 0 } = body;

        const result = await seedKeyboardShortcutsNote({
            pinned,
            position,
        });

        return NextResponse.json({
            success: true,
            message: 'Keyboard Shortcuts note created successfully',
            data: result,
        }, { status: 201 });

    } catch (error) {
        console.error('❌ Failed to seed shortcuts note:', error);

        return NextResponse.json({
            success: false,
            message: 'Failed to create Keyboard Shortcuts note',
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'Use POST to create the Keyboard Shortcuts note',
        usage: {
            method: 'POST',
            endpoint: '/api/seed/shortcuts-note',
            body: {
                pinned: 'boolean (optional, default: false)',
                position: 'number (optional, default: 0)',
            },
            example: 'fetch("/api/seed/shortcuts-note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: false, position: 0 }) })',
        },
    });
}

