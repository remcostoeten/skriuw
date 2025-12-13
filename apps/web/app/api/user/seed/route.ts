import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { seedNewUser, userNeedsSeeding } from '@/lib/seed-user'

/**
 * Seeds the current user with template notes if they haven't been seeded yet.
 * Called after signup or on first login.
 */
export async function POST(request: NextRequest) {
    const session = await auth?.api.getSession({ headers: request.headers })
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // Check if user needs seeding
    const needsSeeding = await userNeedsSeeding(userId)
    if (!needsSeeding) {
        return NextResponse.json({ seeded: false, reason: 'already_seeded' })
    }

    // Seed the user
    await seedNewUser(userId)

    return NextResponse.json({ seeded: true })
}
