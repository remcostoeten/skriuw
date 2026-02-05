import { NextRequest, NextResponse } from 'next/server'
import { requireMutation, allowReadAccess, GUEST_USER_ID } from '@/lib/api-auth'
import { getDatabase, files, eq, and, desc, asc, like } from '@skriuw/db'

// GET /api/assets - List user's files with pagination, search, sorting
export async function GET(request: NextRequest) {
    try {
        const userId = await allowReadAccess()
        if (userId === GUEST_USER_ID) {
            return NextResponse.json({ items: [], total: 0, page: 1, limit: 20 })
        }

        const { searchParams } = new URL(request.url)
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
        const search = searchParams.get('search') || ''
        const sort = searchParams.get('sort') || 'createdAt'
        const order = searchParams.get('order') || 'desc'

        const db = getDatabase()
        const offset = (page - 1) * limit

        // Build where clause
        const whereClause = search
            ? and(eq(files.userId, userId), like(files.name, `%${search}%`))
            : eq(files.userId, userId)

        // Get total count
        const countResult = await db
            .select({ count: files.id })
            .from(files)
            .where(whereClause)

        const total = countResult.length

        // Get paginated results
        const sortColumn = sort === 'name' ? files.name : sort === 'size' ? files.size : files.createdAt
        const orderFn = order === 'asc' ? asc : desc

        const items = await db
            .select()
            .from(files)
            .where(whereClause)
            .orderBy(orderFn(sortColumn))
            .limit(limit)
            .offset(offset)

        return NextResponse.json({
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        })
    } catch (error) {
        console.error('GET /api/assets error:', error)
        return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 })
    }
}

// DELETE /api/assets?id=xxx - Delete file record and optionally from storage
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireMutation()
        if (!auth.authenticated) return auth.response
        const { userId } = auth

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')
        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 })
        }

        const db = getDatabase()

        // Get the file to check ownership and retrieve URL for potential storage deletion
        const [file] = await db
            .select()
            .from(files)
            .where(and(eq(files.id, id), eq(files.userId, userId)))
            .limit(1)

        if (!file) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 })
        }

        // Delete from database
        await db.delete(files).where(and(eq(files.id, id), eq(files.userId, userId)))

        // TODO: For UploadThing, implement deletion via their API
        // if (file.storageProvider === 'uploadthing') {
        //   await utapi.deleteFiles(file.url)
        // }

        return NextResponse.json({ success: true, id })
    } catch (error) {
        console.error('DELETE /api/assets error:', error)
        return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
    }
}

// POST /api/assets - Create a new file record (for Tauri/local uploads)
export async function POST(request: NextRequest) {
    try {
        const auth = await requireMutation()
        if (!auth.authenticated) return auth.response
        const { userId } = auth

        const body = await request.json()
        const { url, name, originalName, size, type, storageProvider } = body

        if (!url || !name) {
            return NextResponse.json({ error: 'URL and name are required' }, { status: 400 })
        }

        const db = getDatabase()
        const { generateId } = await import('@skriuw/shared')

        const newFile = {
            id: generateId('file'),
            userId,
            url,
            name,
            originalName: originalName || name,
            size: size || 0,
            type: type || 'unknown',
            storageProvider: storageProvider || 'local-fs',
            isPublic: false,
            createdAt: Date.now()
        }

        await db.insert(files).values(newFile)

        return NextResponse.json(newFile, { status: 201 })
    } catch (error) {
        console.error('POST /api/assets error:', error)
        return NextResponse.json({ error: 'Failed to create asset record' }, { status: 500 })
    }
}
