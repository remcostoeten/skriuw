'use client'

import type { SidebarContentType } from "./types";
import { usePathname } from "next/navigation";

/**
 * Determines the sidebar content type based on the current route
 */
export function useSidebarContentType(): SidebarContentType {
	const pathname = usePathname()

	// UI Playground uses table of contents
	if (pathname === '/_ui-playground') {
		return 'table-of-contents'
	}

	// Future routes can be added here:
	if (pathname.startsWith('/tasks')) {
		return 'tasks'
	}
	// if (location.pathname.startsWith('/agenda')) {
	//   return 'agenda'
	// }

	// Default: files and folders tree
	return 'files'
}
