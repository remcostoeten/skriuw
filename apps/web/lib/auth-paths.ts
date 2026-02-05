const AUTH_PATHS = ['/login', '/register', '/reset-password', '/forgot-password', '/magic-link']

function isPathMatch(pathname: string, authPath: string): boolean {
	return pathname === authPath || pathname.startsWith(`${authPath}/`)
}

export function isAuthPath(pathname: string): boolean {
	if (pathname.startsWith('/auth/') || pathname === '/auth') return true

	for (const authPath of AUTH_PATHS) {
		if (isPathMatch(pathname, authPath)) {
			return true
		}
	}

	return false
}
