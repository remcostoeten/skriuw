import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
	// Redirect auth page to home and request auth drawer open
	if (request.nextUrl.pathname === '/login') {
		const url = new URL('/', request.url)
		url.searchParams.set('auth', '1')
		return NextResponse.redirect(url)
	}

	// Redirect /notes to /note
	if (request.nextUrl.pathname === '/notes') {
		return NextResponse.redirect(new URL('/note', request.url))
	}

	// Add any other middleware logic here (auth, redirects, etc.)
	return NextResponse.next()
}

export const config = {
	matcher: [
		// Skip static files and API routes
		'/((?!_next/static|_next/image|favicon.ico|api/).*)'
	]
}
