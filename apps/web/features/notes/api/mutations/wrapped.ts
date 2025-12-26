/**
 * @fileoverview Wrapped Mutations with Auth Popup
 * @description Exports all mutations wrapped with auth popup for zero-session users
 */

import { withAuthPopup } from '@/lib/auth-popup-wrapper'
import { createFolder as createFolderMutation } from './create-folder'
import { createNote as createNoteMutation } from './create-note'
import { deleteItem as deleteItemMutation } from './delete-item'
import { favoriteNote as favoriteNoteMutation } from './favorite-note'
import { moveItem as moveItemMutation } from './move-item'
import { pinItem as pinItemMutation } from './pin-item'
import { renameItem as renameItemMutation } from './rename-item'
import { updateNote as updateNoteMutation } from './update-note'
import { setNoteVisibility as setNoteVisibilityMutation } from './set-visibility'

// Wrap each mutation with auth popup
export const createNote = withAuthPopup(createNoteMutation, 'create-note')
export const createFolder = withAuthPopup(createFolderMutation, 'create-folder')
export const deleteItem = withAuthPopup(deleteItemMutation, 'delete-item')
export const favoriteNote = withAuthPopup(favoriteNoteMutation, 'favorite-note')
export const moveItem = withAuthPopup(moveItemMutation, 'move-item')
export const pinItem = withAuthPopup(pinItemMutation, 'pin-item')
export const renameItem = withAuthPopup(renameItemMutation, 'rename-item')
export const updateNote = withAuthPopup(updateNoteMutation, 'update-note')
export const setNoteVisibility = withAuthPopup(
	setNoteVisibilityMutation,
	'set-visibility'
)
