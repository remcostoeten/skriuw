/**
 * @fileoverview Examples of Using the Generic CRUD Wrapper System
 * @description Shows how to use the auto-wrapping system for existing and new features
 */

import { getFeatureMutations, autoImportAndWrapMutations } from './auto-mutation-wrapper'

// Type definitions for example features
interface Post {
	id: string
	title: string
	content: string
	createdAt: number
	updatedAt: number
	authorId: string
	isPublished?: boolean
}

interface CreatePostData {
	title: string
	content: string
	authorId: string
}

// ===== EXISTING FEATURES =====

// Notes mutations - automatically wrapped
import * as notesMutations from '../features/notes/api/mutations'
export const wrappedNotesMutations = getFeatureMutations('notes', notesMutations)

// Tasks mutations - automatically wrapped  
import * as tasksMutations from '../features/tasks/api/mutations'
export const wrappedTasksMutations = getFeatureMutations('tasks', tasksMutations)

// Settings mutations - not wrapped (configured as shouldWrap: false)
import * as settingsMutations from '../features/settings/api/mutations'
export const wrappedSettingsMutations = getFeatureMutations('settings', settingsMutations)

// ===== NEW FEATURES (Zero Configuration) =====

// Example: Posts feature - automatically discovered and wrapped
export async function getPostsMutations() {
	return await autoImportAndWrapMutations(
		'posts',
		'../features/posts/api/mutations'
	)
}

// Example: Comments feature - automatically discovered and wrapped
export async function getCommentsMutations() {
	return await autoImportAndWrapMutations(
		'comments', 
		'../features/comments/api/mutations'
	)
}

// ===== USAGE IN HOOKS =====

/**
 * Example of using wrapped mutations in a hook
 * No manual wrapping required - just import and use
 */
export function usePosts() {
	const createPost = async (title: string, content: string) => {
		// Get wrapped mutations dynamically
		const postsMutations = await getPostsMutations()
		
		// This will automatically show auth popup for zero-session users
		// on every 5th action with 1-hour cooldown
		return await postsMutations.createPost({ title, content })
	}

	const updatePost = async (id: string, data: Partial<Post>) => {
		const postsMutations = await getPostsMutations()
		// Same auth popup logic applies automatically
		return await postsMutations.updatePost(id, data)
	}

	const deletePost = async (id: string) => {
		const postsMutations = await getPostsMutations()
		// Same auth popup logic applies automatically  
		return await postsMutations.deletePost(id)
	}

	return { createPost, updatePost, deletePost }
}

// ===== FEATURE CONFIGURATION =====

/**
 * You can configure feature behavior by adding to FEATURE_CONFIGS
 * Or use the default configuration (shouldWrap: true)
 */

// For features that need custom configuration:
import { addFeatureConfig } from './auto-mutation-wrapper'

// Add a new feature with custom configuration
addFeatureConfig('analytics', {
	shouldWrap: false, // Analytics should work silently
	actionPrefix: 'track' // Custom action prefix
})

// ===== DYNAMIC FEATURE LOADING =====

/**
 * Example of loading a feature dynamically (e.g., for plugins or lazy-loaded features)
 */
export async function loadPluginFeature(pluginName: string) {
	try {
		// Add configuration for the plugin
		addFeatureConfig(pluginName, {
			shouldWrap: true,
			actionPrefix: pluginName
		})

		// Load and wrap the plugin's mutations
		const pluginMutations = await autoImportAndWrapMutations(
			pluginName as any,
			`/plugins/${pluginName}/mutations`
		)

		return pluginMutations
	} catch (error) {
		console.error(`Failed to load plugin ${pluginName}:`, error)
		throw error
	}
}
