import { createReactBlockSpec } from "@blocknote/react";
import { Check, Hash, Tag, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const CATEGORIES = [
	{
		id: 'personal',
		label: 'Personal',
		color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
	},
	{
		id: 'work',
		label: 'Work',
		color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
	},
	{ id: 'ideas', label: 'Ideas', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
	{ id: 'journal', label: 'Journal', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20' }
] as const

export const headerBlockSpec = createReactBlockSpec(
	{
		type: 'header',
		propSchema: {
			category: {
				default: 'personal'
			},
			tags: {
				default: '[]' // JSON stringified array of strings
			}
		},
		content: 'inline'
	},
	{
		render: ({ block, editor, contentRef }) => {
			const [categoryOpen, setCategoryOpen] = useState(false)
			const [tagInput, setTagInput] = useState('')
			const containerRef = useRef<HTMLDivElement>(null)
			const categoryRef = useRef<HTMLDivElement>(null)

			const currentCategory =
				CATEGORIES.find((c) => c.id === block.props.category) || CATEGORIES[0]
			const tags: string[] = JSON.parse(block.props.tags || '[]')

			// Close category dropdown when clicking outside
			useEffect(() => {
				const handleClickOutside = (event: MouseEvent) => {
					if (
						categoryRef.current &&
						!categoryRef.current.contains(event.target as Node)
					) {
						setCategoryOpen(false)
					}
				}
				document.addEventListener('mousedown', handleClickOutside)
				return () => document.removeEventListener('mousedown', handleClickOutside)
			}, [])

			const updateCategory = (id: string) => {
				editor.updateBlock(block.id, {
					props: { ...block.props, category: id }
				})
				setCategoryOpen(false)
			}

			const addTag = () => {
				if (!tagInput.trim()) return
				const newTags = [...tags, tagInput.trim()]
				editor.updateBlock(block.id, {
					props: { ...block.props, tags: JSON.stringify(newTags) }
				})
				setTagInput('')
			}

			const removeTag = (index: number) => {
				const newTags = tags.filter((_, i) => i !== index)
				editor.updateBlock(block.id, {
					props: { ...block.props, tags: JSON.stringify(newTags) }
				})
			}

			const handleTagKeyDown = (e: React.KeyboardEvent) => {
				if (e.key === 'Enter') {
					e.preventDefault()
					addTag()
				}
				if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
					removeTag(tags.length - 1)
				}
			}

			return (
				<div
					className='group relative my-6 rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md'
					contentEditable={false} // The main container isn't editable, but specific parts are
				>
					{/* Header Top Row: Category & Meta */}
					<div className='flex items-center justify-between mb-4'>
						<div className='relative' ref={categoryRef}>
							<button
								onClick={() => setCategoryOpen(!categoryOpen)}
								className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${currentCategory.color} hover:bg-opacity-20`}
							>
								<Hash className='w-3.5 h-3.5' />
								{currentCategory.label}
								<ChevronDown
									className={`w-3 h-3 transition-transform ${categoryOpen ? 'rotate-180' : ''}`}
								/>
							</button>

							{categoryOpen && (
								<div className='absolute top-full left-0 mt-2 w-40 z-50 rounded-lg border bg-popover p-1 shadow-md animate-in fade-in zoom-in-95 duration-100'>
									{CATEGORIES.map((cat) => (
										<button
											key={cat.id}
											onClick={() => updateCategory(cat.id)}
											className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground ${block.props.category === cat.id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
										>
											<div
												className={`w-2 h-2 rounded-full ${cat.color.split(' ')[0].replace('/10', '')}`}
											/>
											{cat.label}
											{block.props.category === cat.id && (
												<Check className='ml-auto w-3 h-3' />
											)}
										</button>
									))}
								</div>
							)}
						</div>

						<div className='text-[10px] text-muted-foreground font-medium uppercase tracking-wider'>
							Metadata
						</div>
					</div>

					{/* Title Area (Main Content) */}
					<div
						className='min-w-[100px] text-3xl font-bold text-foreground placeholder-muted-foreground/30 !outline-none !border-none'
						ref={contentRef}
					/>

					{/* Tags Section */}
					<div className='flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border/40'>
						<div className='flex items-center gap-1.5 text-muted-foreground'>
							<Tag className='w-3.5 h-3.5' />
						</div>

						{tags.map((tag, i) => (
							<span
								key={i}
								className='inline-flex items-center px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium ring-1 ring-inset ring-black/5 dark:ring-white/10'
							>
								{tag}
								<button
									onClick={() => removeTag(i)}
									className='ml-1.5 hover:text-destructive focus:outline-none'
								>
									&times;
								</button>
							</span>
						))}

						<input
							type='text'
							value={tagInput}
							onChange={(e) => setTagInput(e.target.value)}
							onKeyDown={handleTagKeyDown}
							placeholder={tags.length === 0 ? 'Add tags...' : ''}
							className='flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/40'
						/>
					</div>
				</div>
			)
		}
	}
)
