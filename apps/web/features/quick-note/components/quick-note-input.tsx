'use client'

import { useNotesContext } from "../../notes/context/notes-context";
import { Plus } from "lucide-react";
import { useState } from "react";

export function QuickNoteInput() {
	const [noteTitle, setNoteTitle] = useState('')
	const { createNote } = useNotesContext()

	const handleCreateQuickNote = async () => {
		if (!noteTitle.trim()) return

		try {
			// This will trigger activity tracking: { action: 'created', entityType: 'note' }
			await createNote(noteTitle)
			setNoteTitle('') // Clear input after successful creation
		} catch (error) {
			console.error('Failed to create quick note:', error)
		}
	}

	function handleKeyPress(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === 'Enter') {
			handleCreateQuickNote()
		}
	}

	return (
		<div className='w-full max-w-md border rounded-lg p-6 space-y-4'>
			<div className='text-lg font-semibold flex items-center gap-2'>
				<Plus className='h-5 w-5' />
				Quick Note
			</div>
			<div className='space-y-3'>
				<input
					type='text'
					placeholder='Create a quick note...'
					value={noteTitle}
					onChange={(e) => setNoteTitle(e.target.value)}
					onKeyPress={handleKeyPress}
					className='w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
				/>
				<button
					onClick={handleCreateQuickNote}
					disabled={!noteTitle.trim()}
					className='w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
				>
					Create Note
				</button>
			</div>
		</div>
	)
}
