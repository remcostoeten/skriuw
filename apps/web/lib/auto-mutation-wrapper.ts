/**
 * @fileoverview Automatic Mutation Wrapper Generator
 * @description Discovers and wraps mutations for any feature without manual configuration
 */

import { getWrappedMutations, FEATURE_CONFIGS } from './generic-crud-wrapper'

type MutationModule = Record<string, (...args: any[]) => Promise<any>>

/**
 * Registry of all wrapped mutations across the application
 * This acts as a central cache for wrapped mutations
 */
const wrappedMutationsRegistry = new Map<string, MutationModule>()

/**
 * Gets or creates wrapped mutations for a feature
 * Uses caching to avoid re-wrapping the same mutations multiple times
 */
export function getFeatureMutations<T extends MutationModule>(
	featureName: keyof typeof FEATURE_CONFIGS,
	mutationModule: T
): T {
	const cacheKey = featureName as string
	
	// Check if we already have wrapped mutations cached
	if (wrappedMutationsRegistry.has(cacheKey)) {
		return wrappedMutationsRegistry.get(cacheKey) as T
	}

	// Wrap the mutations and cache them
	const wrapped = getWrappedMutations(mutationModule, featureName)
	wrappedMutationsRegistry.set(cacheKey, wrapped)
	
	return wrapped
}

/**
 * Auto-imports and wraps mutations for a feature by path
 * This enables zero-configuration setup for new features
 */
export async function autoImportAndWrapMutations<T extends MutationModule>(
	featureName: keyof typeof FEATURE_CONFIGS,
	mutationPath: string
): Promise<T> {
	const cacheKey = featureName as string
	
	// Check cache first
	if (wrappedMutationsRegistry.has(cacheKey)) {
		return wrappedMutationsRegistry.get(cacheKey) as T
	}

	try {
		// Dynamic import of the mutation module
		const mutationModule = await import(mutationPath)
		
		// Wrap and cache
		const wrapped = getWrappedMutations(mutationModule as T, featureName)
		wrappedMutationsRegistry.set(cacheKey, wrapped)
		
		return wrapped
	} catch (error) {
		console.error(`Failed to auto-import mutations for ${featureName}:`, error)
		throw new Error(`Could not load mutations for feature: ${featureName}`)
	}
}

/**
 * Clears the wrapped mutations cache
 * Useful for testing or hot-reloading scenarios
 */
export function clearMutationCache(): void {
	wrappedMutationsRegistry.clear()
}

/**
 * Checks if a feature has mutations configured
 */
export function hasFeatureConfig(featureName: string): boolean {
	return featureName in FEATURE_CONFIGS
}

/**
 * Adds a new feature configuration at runtime
 * Useful for dynamically loaded features or plugins
 */
export function addFeatureConfig(
	featureName: string,
	config: { shouldWrap?: boolean; actionPrefix?: string }
): void {
	// Type assertion to allow dynamic addition
	(FEATURE_CONFIGS as any)[featureName] = {
		feature: featureName,
		shouldWrap: config.shouldWrap ?? true,
		actionName: config.actionPrefix
	}
}
