/**
 * @description Merge class names into a single string
 * @param inputs - The class names to merge
 * @returns The merged class names
 */

/**
 * @example
 * ```ts
 * const className = cn('text-red-500', 'text-blue-500')
 * // 'text-red-500 text-blue-500'
 * ```
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
