'use client'

import { useState } from 'react'
import {
	useTagsWithCountQuery,
	useUpdateTagMutation,
	useDeleteTagMutation,
	useCreateTagMutation
} from '../hooks/use-tags-query'
import { TagBadge } from './tag-badge'
import type { Tag } from '../types'
import { cn } from '@skriuw/shared'
import { Trash2, Pencil, Plus, Check, X, Loader2 } from 'lucide-react'
import { Button, Input } from '@skriuw/ui'

const TAG_COLORS = [
	'#6366f1',
	'#8b5cf6',
	'#ec4899',
	'#f43f5e',
	'#f97316',
	'#eab308',
	'#22c55e',
	'#14b8a6',
	'#06b6d4',
	'#3b82f6'
]

export function TagsSettings() {
	const { data: tags = [], isLoading } = useTagsWithCountQuery()
	const updateTag = useUpdateTagMutation()
	const deleteTag = useDeleteTagMutation()
	const createTag = useCreateTagMutation()

	const [editingId, setEditingId] = useState<string | null>(null)
	const [editName, setEditName] = useState('')
	const [editColor, setEditColor] = useState('')
	const [newTagName, setNewTagName] = useState('')
	const [newTagColor, setNewTagColor] = useState('#6366f1')
	const [showNew, setShowNew] = useState(false)

	function startEdit(tag: Tag) {
		setEditingId(tag.id)
		setEditName(tag.name)
		setEditColor(tag.color ?? '#6366f1')
	}

	async function saveEdit() {
		if (!editingId || !editName.trim()) return
		await updateTag.mutateAsync({ id: editingId, name: editName, color: editColor })
		setEditingId(null)
	}

	function cancelEdit() {
		setEditingId(null)
		setEditName('')
		setEditColor('')
	}

	async function handleDelete(id: string) {
		await deleteTag.mutateAsync(id)
	}

	async function handleCreateTag() {
		if (!newTagName.trim()) return
		await createTag.mutateAsync({ name: newTagName, color: newTagColor })
		setNewTagName('')
		setNewTagColor('#6366f1')
		setShowNew(false)
	}

	if (isLoading) {
		return (
			<div className='flex items-center justify-center py-8'>
				<Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
			</div>
		)
	}

	return (
		<div className='w-full max-w-2xl'>
			<div className='pb-4 mb-2 border-b border-border'>
				<div className='flex items-center justify-between'>
					<div>
						<h2 className='text-xl font-semibold text-foreground'>My Tags</h2>
						<p className='text-sm text-muted-foreground mt-1'>
							Manage your tags, customize colors, and see usage across notes
						</p>
					</div>
					<Button
						size='sm'
						variant='outline'
						onClick={() => setShowNew(true)}
						className='gap-1.5'
					>
						<Plus className='w-3.5 h-3.5' />
						New tag
					</Button>
				</div>
			</div>

			{showNew && (
				<div className='flex items-center gap-3 py-3 border-b border-border/50'>
					<div className='flex items-center gap-2'>
						{TAG_COLORS.map((color) => (
							<button
								key={color}
								type='button'
								onClick={() => setNewTagColor(color)}
								className={cn(
									'w-5 h-5 rounded-full transition-transform',
									newTagColor === color &&
										'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
								)}
								style={{ backgroundColor: color }}
							/>
						))}
					</div>
					<Input
						value={newTagName}
						onChange={(e) => setNewTagName(e.target.value)}
						placeholder='Tag name'
						className='flex-1 h-8 text-sm'
						onKeyDown={(e) => {
							if (e.key === 'Enter') handleCreateTag()
							if (e.key === 'Escape') setShowNew(false)
						}}
						autoFocus
					/>
					<div className='flex items-center gap-1'>
						<Button
							size='sm'
							variant='ghost'
							onClick={() => setShowNew(false)}
							className='h-8 w-8 p-0'
						>
							<X className='w-4 h-4' />
						</Button>
						<Button
							size='sm'
							onClick={handleCreateTag}
							disabled={!newTagName.trim()}
							className='h-8 w-8 p-0'
						>
							<Check className='w-4 h-4' />
						</Button>
					</div>
				</div>
			)}

			{tags.length === 0 && !showNew ? (
				<div className='text-center py-12'>
					<p className='text-muted-foreground text-sm'>No tags yet</p>
					<p className='text-muted-foreground/70 text-xs mt-1'>
						Create tags by typing in the note header or click "New tag" above
					</p>
				</div>
			) : (
				<div className='divide-y divide-border/50'>
					{tags.map((tag) => (
						<div key={tag.id} className='flex items-center justify-between py-3 group'>
							{editingId === tag.id ? (
								<div className='flex items-center gap-3 flex-1'>
									<div className='flex items-center gap-1.5'>
										{TAG_COLORS.map((color) => (
											<button
												key={color}
												type='button'
												onClick={() => setEditColor(color)}
												className={cn(
													'w-4 h-4 rounded-full transition-transform',
													editColor === color &&
														'ring-2 ring-offset-1 ring-offset-background ring-primary scale-110'
												)}
												style={{ backgroundColor: color }}
											/>
										))}
									</div>
									<Input
										value={editName}
										onChange={(e) => setEditName(e.target.value)}
										className='flex-1 h-7 text-sm'
										onKeyDown={(e) => {
											if (e.key === 'Enter') saveEdit()
											if (e.key === 'Escape') cancelEdit()
										}}
										autoFocus
									/>
									<div className='flex items-center gap-1'>
										<Button
											size='sm'
											variant='ghost'
											onClick={cancelEdit}
											className='h-7 w-7 p-0'
										>
											<X className='w-3.5 h-3.5' />
										</Button>
										<Button
											size='sm'
											onClick={saveEdit}
											disabled={!editName.trim()}
											className='h-7 w-7 p-0'
										>
											<Check className='w-3.5 h-3.5' />
										</Button>
									</div>
								</div>
							) : (
								<>
									<div className='flex items-center gap-3'>
										<TagBadge
											name={tag.name}
											color={tag.color ?? '#6366f1'}
											size='md'
										/>
										<span className='text-xs text-muted-foreground'>
											{tag.noteCount} {tag.noteCount === 1 ? 'note' : 'notes'}
										</span>
									</div>
									<div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
										<Button
											size='sm'
											variant='ghost'
											onClick={() => startEdit(tag)}
											className='h-7 w-7 p-0'
										>
											<Pencil className='w-3.5 h-3.5' />
										</Button>
										<Button
											size='sm'
											variant='ghost'
											onClick={() => handleDelete(tag.id)}
											className='h-7 w-7 p-0 text-destructive hover:text-destructive'
										>
											<Trash2 className='w-3.5 h-3.5' />
										</Button>
									</div>
								</>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	)
}
