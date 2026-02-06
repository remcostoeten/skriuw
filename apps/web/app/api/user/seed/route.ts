import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
	const session = await auth?.api.getSession({ headers: request.headers })
	if (!session?.user?.id) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
	}

	return NextResponse.json({ seeded: false, reason: 'seeding_disabled' })
}
