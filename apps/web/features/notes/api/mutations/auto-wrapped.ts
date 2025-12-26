/**
 * @fileoverview Auto-Wrapped Notes Mutations
 * @description Automatically wrapped mutations using the generic CRUD wrapper system
 */

import { getFeatureMutations } from '@/lib/auto-mutation-wrapper'
import * as notesMutations from './create-folder'
import { createNote as createNoteMutation } from './create-note'
import { deleteItem as deleteItemMutation } from './delete-item'
import { favoriteNote as favoriteNoteMutation } from './favorite-note'
import { moveItem as moveItemMutation } from './move-item'
import { pinItem as pinItemMutation } from './pin-item'
import { renameItem as renameItemMutation } from './rename-item'
import { updateNote as updateNoteMutation } from './update-note'
import { setNoteVisibility as setNoteVisibilityMutation } from './set-visibility'

// Combine all mutations into a single module
const allNotesMutations = {
	...notesMutations,
	createNote: createNoteMutation,
	deleteItem: deleteItemMutation,
	favoriteNote: favoriteNoteMutation,
	moveItem: moveItemMutation,
	pinItem: pinItemMutation,
	renameItem: renameItemMutation,
	updateNote: updateNoteMutation,
	setNoteVisibility: setNoteVisibilityMutation,
}

// Automatically wrap all mutations with auth popup logic
export const wrapped = getFeatureMutations('notes', allNotesMutations)

// Export individual wrapped mutations for backward compatibility
export const createNote = wrapped.createNote
export const createFolder = wrapped.createFolder
export const deleteItem = wrapped.deleteItem
export const favoriteNote = wrapped.favoriteNote
export const moveItem = wrapped.moveItem
export const pinItem = wrapped.pinItem
export const renameItem = wrapped.renameItem
export const updateNote = wrapped.updateNote
export const setNoteVisibility = wrapped.setNoteVisibility
