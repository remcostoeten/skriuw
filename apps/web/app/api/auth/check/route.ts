import { getSession } from '@/lib/api-auth'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await getSession()

    // Check if user has any session (authenticated or anonymous)
    const hasIdentity = !!session?.user

    return NextResponse.json({
      hasIdentity,
      isAuthenticated: hasIdentity && !session?.user?.isAnonymous,
      isAnonymous: session?.user?.isAnonymous ?? false,
      userId: session?.user?.id
    })
  } catch (error) {
    return NextResponse.json(
      { hasIdentity: false, error: 'Session check failed' },
      { status: 401 }
    )
  }
}