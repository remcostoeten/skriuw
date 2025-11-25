import { useLocation } from 'react-router-dom'

import type { SidebarContentType } from './types'

/**
 * Determines the sidebar content type based on the current route
 */
export function useSidebarContentType(): SidebarContentType {
	const location = useLocation()

	// UI Playground uses table of contents
	if (location.pathname === '/_ui-playground') {
		return 'table-of-contents'
	}

	// Future routes can be added here:
	// if (location.pathname.startsWith('/tasks')) {
	//   return 'tasks'
	// }
	// if (location.pathname.startsWith('/agenda')) {
	//   return 'agenda'
	// }

	// Default: files and folders tree
	return 'files'
}

