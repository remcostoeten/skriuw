/**
 * API Route for seeding the Upgrade & Improvements Todo note
 * Usage: POST /api/seed/todos-note
 */

import { NextRequest, NextResponse } from 'next/server';
import { seedTodosNote } from './seed';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const { pinned = false, position = 0 } = body;

        const result = await seedTodosNote({
            pinned,
            position,
        });

        return NextResponse.json({
            success: true,
            message: 'Upgrade & Improvements Todo note created successfully',
            data: result,
        }, { status: 201 });

    } catch (error) {
        console.error('❌ Failed to seed todos note:', error);

        return NextResponse.json({
            success: false,
            message: 'Failed to create Upgrade & Improvements Todo note',
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'Use POST to create the Upgrade & Improvements Todo note',
        usage: {
            method: 'POST',
            endpoint: '/api/seed/todos-note',
            body: {
                pinned: 'boolean (optional, default: false)',
                position: 'number (optional, default: 0)',
            },
            example: 'fetch("/api/seed/todos-note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: false, position: 0 }) })',
        },
    });
}

