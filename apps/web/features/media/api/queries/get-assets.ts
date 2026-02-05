'use server'

import { files, getDatabase, eq, and, like, desc, asc, type File } from '@skriuw/db'
import { readOwned } from '@/lib/server/crud-helpers'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export type AssetSort = 'createdAt' | 'name' | 'size'
export type AssetOrder = 'asc' | 'desc'

export type GetAssetsParams = {
    page?: number
    limit?: number
    search?: string
    sort?: AssetSort
    order?: AssetOrder
}

export type AssetsResponse = {
    items: File[]
    total: number
    page: number
    limit: number
    totalPages: number
}

export async function getAssets({
    page = 1,
    limit = 20,
    search = '',
    sort = 'createdAt',
    order = 'desc'
}: GetAssetsParams = {}): Promise<AssetsResponse> {
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if (!session?.user?.id) {
        return { items: [], total: 0, page, limit, totalPages: 0 }
    }

    const userId = session.user.id
    const db = getDatabase()
    const offset = (page - 1) * limit

    // Build conditions
    const conditions = [eq(files.userId, userId)]
    if (search) {
        conditions.push(like(files.name, `%${search}%`))
    }

    const whereClause = and(...conditions)

    // Get total count
    const countResult = await db
        .select({ count: files.id })
        .from(files)
        .where(whereClause)

    const total = countResult.length

    // Get items
    const sortColumn = sort === 'name' ? files.name : sort === 'size' ? files.size : files.createdAt
    const orderFn = order === 'asc' ? asc : desc

    const items = await db
        .select()
        .from(files)
        .where(whereClause)
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset)

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    }
}
