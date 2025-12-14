import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/storage/adapters/server-db'
import { requireAuth } from '@/lib/api-auth'
import { encryptConnectorState, decryptConnectorState } from '@/features/backup/core/connector-secrets'
import type { StorageConnectorType, OAuth2Tokens } from '@/features/backup/core/types'

function generateId(): string {
    return `sc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

type DbConnector = {
    id: string
    type: string
    name: string
    status: string
    config: Record<string, string>
    oauth2Tokens?: Record<string, string | number>
    lastValidatedAt?: number | null
    lastError?: string | null
    userId?: string | null
    createdAt: number
    updatedAt: number
}

// GET - List user's connectors
export async function GET() {
    const authResult = await requireAuth()
    if (!authResult.authenticated) return authResult.response

    try {
        const connectorList = await db.findAll<DbConnector>('storageConnectors', authResult.userId)

        // Decrypt sensitive fields
        const decrypted = connectorList.map((connector) => {
            const decryptedState = decryptConnectorState({
                id: connector.id,
                type: connector.type as StorageConnectorType,
                name: connector.name,
                status: connector.status as 'connected' | 'configured' | 'error' | 'disconnected',
                config: connector.config || {},
                oauth2Tokens: connector.oauth2Tokens as unknown as OAuth2Tokens | undefined,
                lastValidatedAt: connector.lastValidatedAt?.toString(),
                lastError: connector.lastError ?? null,
            })

            return decryptedState
        })

        return NextResponse.json({ connectors: decrypted })
    } catch (error) {
        console.error('Failed to fetch connectors:', error)
        return NextResponse.json({ error: 'Failed to fetch connectors' }, { status: 500 })
    }
}

// POST - Create or update connector
export async function POST(request: NextRequest) {
    const authResult = await requireAuth()
    if (!authResult.authenticated) return authResult.response

    try {
        const body = await request.json()
        const { id, type, name, status, config, oauth2Tokens, lastValidatedAt, lastError } = body

        if (!type || !name) {
            return NextResponse.json({ error: 'Type and name are required' }, { status: 400 })
        }

        // Encrypt sensitive fields
        const encrypted = encryptConnectorState({
            id: id || generateId(),
            type,
            name,
            status: status || 'configured',
            config: config || {},
            oauth2Tokens,
            lastValidatedAt,
            lastError,
        })

        const now = Date.now()

        // Check if connector exists for this user+type
        const existingList = await db.findAll<DbConnector>('storageConnectors', authResult.userId)
        const existing = existingList.find((c) => c.type === type)

        if (existing) {
            // Update
            await db.update('storageConnectors', existing.id, {
                name,
                status: encrypted.status,
                config: encrypted.config,
                oauth2Tokens: encrypted.oauth2Tokens,
                lastValidatedAt: lastValidatedAt ? parseInt(lastValidatedAt) : null,
                lastError: lastError || null,
                updatedAt: now,
            }, authResult.userId)

            return NextResponse.json({ success: true, id: existing.id })
        } else {
            // Insert
            const connectorId = encrypted.id || generateId()
            await db.create('storageConnectors', {
                id: connectorId,
                type,
                name,
                status: encrypted.status,
                config: encrypted.config,
                oauth2Tokens: encrypted.oauth2Tokens,
                lastValidatedAt: lastValidatedAt ? parseInt(lastValidatedAt) : null,
                lastError: lastError || null,
                createdAt: now,
                updatedAt: now,
            }, authResult.userId)

            return NextResponse.json({ success: true, id: connectorId })
        }
    } catch (error) {
        console.error('Failed to save connector:', error)
        return NextResponse.json({ error: 'Failed to save connector' }, { status: 500 })
    }
}

// DELETE - Remove connector
export async function DELETE(request: NextRequest) {
    const authResult = await requireAuth()
    if (!authResult.authenticated) return authResult.response

    try {
        const { searchParams } = new URL(request.url)
        const type = searchParams.get('type')

        if (!type) {
            return NextResponse.json({ error: 'Type is required' }, { status: 400 })
        }

        // Find the connector by type
        const existingList = await db.findAll<DbConnector>('storageConnectors', authResult.userId)
        const existing = existingList.find((c) => c.type === type)

        if (existing) {
            await db.delete('storageConnectors', existing.id, authResult.userId)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Failed to delete connector:', error)
        return NextResponse.json({ error: 'Failed to delete connector' }, { status: 500 })
    }
}
