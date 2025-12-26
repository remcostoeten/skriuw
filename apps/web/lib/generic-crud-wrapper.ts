/**
 * @fileoverview Generic CRUD Wrapper System
 * @description Automatically wraps all mutations with auth popup logic without manual intervention
 */

import { withAuthPopup } from './auth-popup-wrapper'
import { isZeroSessionUser } from './zero-session-manager'

type MutationFunction = (...args: any[]) => Promise<any>

interface MutationConfig {
	/** Feature name for action tracking (e.g., 'notes', 'tasks', 'posts') */
	feature: string
	/** Whether this mutation should be wrapped with auth popup logic */
	shouldWrap?: boolean
	/** Custom action name override (defaults to function name) */
	actionName?: string
}

/**
 * Higher-order function that automatically wraps mutations with auth popup logic
 * based on configuration and zero-session state
 */
export function createMutationWrapper<T extends Record<string, MutationFunction>>(
	mutations: T,
	config: MutationConfig = { feature: 'unknown' }
): T {
	const { feature, shouldWrap = true, actionName: prefixAction } = config
	
	// If wrapping is disabled or user is not zero-session, return original mutations
	if (!shouldWrap || !isZeroSessionUser()) {
		return mutations
	}

	const wrapped = {} as T

	for (const [functionName, originalFunction] of Object.entries(mutations)) {
		// Generate action name for tracking
		const actionName = prefixAction 
			? `${prefixAction}:${functionName}`
			: `${feature}:${functionName}`

		// Wrap the function with auth popup logic
		wrapped[functionName as keyof T] = withAuthPopup(
			originalFunction,
			actionName
		) as T[keyof T]
	}

	return wrapped
}

/**
 * Automatically discovers and wraps mutations from a feature directory
 */
export async function autoWrapFeatureMutations(
	featurePath: string,
	config: MutationConfig
): Promise<Record<string, MutationFunction>> {
	try {
		// Dynamic import to get all mutations from the feature
		const mutationsModule = await import(featurePath)
		const mutations: Record<string, MutationFunction> = {}

		// Extract all functions that are mutations (typically async functions that modify data)
		for (const [key, value] of Object.entries(mutationsModule)) {
			if (
				typeof value === 'function' &&
				// Skip utility functions and non-mutation functions
				!key.startsWith('_') &&
				!key.includes('utility') &&
				!key.includes('helper') &&
				// Include functions that likely perform mutations
				(key.includes('create') || 
				 key.includes('update') || 
				 key.includes('delete') || 
				 key.includes('save') ||
				 key.includes('sync') ||
				 key.includes('record') ||
				 key.includes('set'))
			) {
				mutations[key] = value as MutationFunction
			}
		}

		return createMutationWrapper(mutations, config)
	} catch (error) {
		console.error(`Failed to auto-wrap mutations for ${featurePath}:`, error)
		return {}
	}
}

/**
 * Configuration for different features
 */
export const FEATURE_CONFIGS: Record<string, MutationConfig> = {
	notes: { feature: 'notes', shouldWrap: true },
	tasks: { feature: 'tasks', shouldWrap: true },
	posts: { feature: 'posts', shouldWrap: true },
	settings: { feature: 'settings', shouldWrap: false }, // Settings might not need auth popup
	activity: { feature: 'activity', shouldWrap: false }, // Activity tracking should work silently
	shortcuts: { feature: 'shortcuts', shouldWrap: true },
}

/**
 * Factory function to get wrapped mutations for any feature
 */
export function getWrappedMutations<T extends Record<string, MutationFunction>>(
	mutations: T,
	featureName: keyof typeof FEATURE_CONFIGS
): T {
	const config = FEATURE_CONFIGS[featureName] || { feature: featureName }
	return createMutationWrapper(mutations, config)
}
