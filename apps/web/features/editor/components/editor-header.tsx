import * as React from 'react'
import {
	Calendar,
	Clock,
	Tag as TagIcon,
	ChevronDown,
	ChevronRight,
	Image as ImageIcon,
	Link2,
	Upload,
	X,
	Check,
	AlertCircle
} from 'lucide-react'
import { cn } from '@skriuw/shared'
import {
	Button,
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
	Popover,
	PopoverContent,
	PopoverTrigger,
	Separator
} from '@skriuw/ui'
import { EmojiIconPicker } from './emoji-picker'
import { MediaPicker } from '@/features/media/components/media-picker'
import { TagAutocompleteInput } from '@/features/tags'

type Props = {
	title: string
	setTitle: (title: string) => void
	icon?: string
	setIcon?: (icon?: string) => void
	createdAt?: number | Date
	updatedAt?: number | Date
	tags?: string[]
	setTags?: (tags: string[]) => void
	className?: string
	showMetadata?: boolean
	coverImage?: string
	setCoverImage?: (url?: string) => void
	onCoverUpload?: (file: File) => void
	enableCoverImages?: boolean
}

function isValidCoverImageUrl(url?: string): boolean {
	if (!url || typeof url !== 'string') return false
	if (
		!url.startsWith('http://') &&
		!url.startsWith('https://') &&
		!url.startsWith('data:') &&
		!url.startsWith('asset://')
	)
		return false
	const blockedDomains = [
		'example.com',
		'example.org',
		'example.net',
		'placeholder.com',
		'placehold.it',
		'via.placeholder.com'
	]
	try {
		const parsed = new URL(url)
		if (
			blockedDomains.some(
				(domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
			)
		)
			return false
	} catch {
		return false
	}
	return true
}

export function EditorHeader({
	title,
	setTitle,
	icon,
	setIcon,
	createdAt,
	updatedAt,
	tags = [],
	setTags,
	className,
	showMetadata = true,
	coverImage,
	setCoverImage,
	onCoverUpload,
	enableCoverImages = true
}: Props) {
	const [isInfoOpen, setIsInfoOpen] = React.useState(true)
	const [pasteUrlInput, setPasteUrlInput] = React.useState('')
	const [pasteUrlError, setPasteUrlError] = React.useState<string | null>(null)
	const [showPasteInput, setShowPasteInput] = React.useState(false)
	const [activeTab, setActiveTab] = React.useState<'upload' | 'link' | 'library'>('upload')

	const validateAndSetCover = () => {
		if (!pasteUrlInput.trim()) {
			setPasteUrlError('Please enter a URL')
			return
		}
		try {
			const parsed = new URL(pasteUrlInput)
			if (!['http:', 'https:'].includes(parsed.protocol)) {
				setPasteUrlError('Only http and https URLs are allowed')
				return
			}
			// Removed strict extension check to support dynamic image URLs (e.g. Unsplash)
			setCoverImage?.(pasteUrlInput)
			setShowPasteInput(false)
			setPasteUrlInput('')
			setPasteUrlError(null)
		} catch {
			setPasteUrlError('Invalid URL')
		}
	}

	const formatDate = (date?: number | Date) => {
		if (!date) return 'Just now'
		const d = new Date(date)
		const now = Date.now()
		const diffMs = now - d.getTime()
		const diffSeconds = Math.round(diffMs / 1000)
		const diffMinutes = Math.round(diffSeconds / 60)
		const diffHours = Math.round(diffMinutes / 60)
		const diffDays = Math.round(diffHours / 24)

		if (diffSeconds < 30) return 'Just now'

		const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
		let label = ''

		if (diffMinutes < 1) {
			label = relative.format(-diffSeconds, 'second')
		} else if (diffHours < 1) {
			label = relative.format(-diffMinutes, 'minute')
		} else if (diffDays < 1) {
			label = relative.format(-diffHours, 'hour')
		} else if (diffDays < 7) {
			label = relative.format(-diffDays, 'day')
		} else {
			label = d.toLocaleDateString('en', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			})
		}

		const time = d.toLocaleTimeString('en', {
			hour: '2-digit',
			minute: '2-digit'
		})
		return `${label} • ${time}`
	}

	return (
		<div className={cn('group w-full', className)}>
			{/* Cover Image */}
			<div
				className={cn(
					'relative w-full group/cover',
					enableCoverImages && isValidCoverImageUrl(coverImage) ? 'h-48' : 'h-0'
				)}
			>
				{enableCoverImages && isValidCoverImageUrl(coverImage) && (
					<>
						<img
							src={coverImage}
							alt='Cover'
							className='w-full h-full object-cover'
							onError={() => setCoverImage?.(undefined)}
						/>
						<div className='absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover/cover:opacity-100 transition-opacity'>
							<Popover>
								<PopoverTrigger asChild>
									<Button
										variant='secondary'
										size='sm'
										className='h-7 text-xs bg-background/80 hover:bg-background backdrop-blur-sm'
									>
										<ImageIcon className='w-3 h-3 mr-1' />
										Change cover
									</Button>
								</PopoverTrigger>
								<PopoverContent className='w-64 p-2' align='end'>
									<div className='w-full'>
										<div className='flex items-center gap-1 mb-2 p-1 bg-muted/50 rounded-lg'>
											{['upload', 'link', 'library'].map((tab) => (
												<button
													key={tab}
													onClick={() => setActiveTab(tab as any)}
													className={cn(
														'flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors capitalize',
														activeTab === tab
															? 'bg-background shadow-sm text-foreground'
															: 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
													)}
												>
													{tab}
												</button>
											))}
										</div>

										{activeTab === 'upload' && (
											<label className='flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50 cursor-pointer transition-colors'>
												<Upload className='w-6 h-6 text-muted-foreground' />
												<span className='text-xs text-muted-foreground font-medium'>
													Click to upload
												</span>
												<input
													type='file'
													accept='image/*'
													className='sr-only'
													onChange={async (e) => {
														const file = e.target.files?.[0]
														if (file && onCoverUpload) {
															onCoverUpload(file)
														}
													}}
												/>
											</label>
										)}

										{activeTab === 'link' && (
											<div className='space-y-2'>
												<input
													type='url'
													placeholder='https://...'
													value={pasteUrlInput}
													onChange={(e) => {
														setPasteUrlInput(e.target.value)
														setPasteUrlError(null)
													}}
													onKeyDown={(e) => {
														if (e.key === 'Enter') {
															e.preventDefault()
															validateAndSetCover()
														}
													}}
													className={cn(
														'w-full px-3 py-2 text-sm bg-muted/50 border rounded-md outline-none focus:ring-1 focus:ring-ring',
														pasteUrlError
															? 'border-destructive'
															: 'border-border'
													)}
													autoFocus
												/>
												{pasteUrlError && (
													<div className='flex items-center gap-1 text-xs text-destructive'>
														<AlertCircle className='w-3 h-3' />
														{pasteUrlError}
													</div>
												)}
												<Button
													size='sm'
													className='w-full h-8 text-xs'
													onClick={validateAndSetCover}
												>
													Add Link
												</Button>
											</div>
										)}

										{activeTab === 'library' && (
											<MediaPicker
												onSelect={(url) => setCoverImage?.(url)}
												className='min-h-[150px]'
											/>
										)}

										{coverImage && (
											<>
												<Separator className='my-2' />
												<button
													type='button'
													className='flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-destructive/10 hover:text-destructive w-full text-left transition-colors text-muted-foreground'
													onClick={() => setCoverImage?.(undefined)}
												>
													<X className='w-3.5 h-3.5' />
													Remove cover
												</button>
											</>
										)}
									</div>
								</PopoverContent>
							</Popover>
						</div>
					</>
				)}
			</div>

			<div className='px-8 pt-6 pb-2 flex flex-col gap-3'>
				{/* Add cover button - only shown when no cover image and cover images are enabled */}
				{showMetadata && enableCoverImages && !isValidCoverImageUrl(coverImage) && (
					<div className='flex items-center'>
						<Popover>
							<PopoverTrigger asChild>
								<Button
									variant='ghost'
									size='sm'
									className='h-7 px-2 text-xs text-muted-foreground opacity-60 hover:opacity-100 hover:text-foreground transition-opacity -ml-2'
								>
									<ImageIcon className='w-3.5 h-3.5 mr-1.5' />
									Add cover
								</Button>
							</PopoverTrigger>
							<PopoverContent className='w-64 p-2' align='start'>
								<div className='space-y-1'>
									<label className='flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent cursor-pointer transition-colors'>
										<Upload className='w-4 h-4' />
										Upload image
										<input
											type='file'
											accept='image/*'
											className='sr-only'
											onChange={async (e) => {
												const file = e.target.files?.[0]
												if (file && onCoverUpload) {
													onCoverUpload(file)
												}
											}}
										/>
									</label>
									<button
										type='button'
										className='flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-accent w-full text-left transition-colors'
										onClick={() => setShowPasteInput((prev) => !prev)}
									>
										<Link2 className='w-4 h-4' />
										Paste link
									</button>
									{showPasteInput && (
										<div className='pt-2 space-y-2'>
											<div className='relative'>
												<input
													type='url'
													placeholder='https://...'
													value={pasteUrlInput}
													onChange={(e) => {
														setPasteUrlInput(e.target.value)
														setPasteUrlError(null)
													}}
													onKeyDown={(e) => {
														if (e.key === 'Enter') {
															e.preventDefault()
															validateAndSetCover()
														}
														if (e.key === 'Escape') {
															setShowPasteInput(false)
															setPasteUrlInput('')
															setPasteUrlError(null)
														}
													}}
													className={cn(
														'w-full px-3 py-2 text-sm bg-muted/50 border rounded-md outline-none focus:ring-1 focus:ring-ring',
														pasteUrlError
															? 'border-destructive'
															: 'border-border'
													)}
													autoFocus
												/>
											</div>
											{pasteUrlError && (
												<div className='flex items-center gap-1 text-xs text-destructive'>
													<AlertCircle className='w-3 h-3' />
													{pasteUrlError}
												</div>
											)}
											<div className='flex gap-1'>
												<Button
													size='sm'
													variant='ghost'
													className='h-7 flex-1 text-xs'
													onClick={() => {
														setShowPasteInput(false)
														setPasteUrlInput('')
														setPasteUrlError(null)
													}}
												>
													<X className='w-3 h-3 mr-1' />
													Cancel
												</Button>
												<Button
													size='sm'
													className='h-7 flex-1 text-xs'
													onClick={validateAndSetCover}
												>
													<Check className='w-3 h-3 mr-1' />
													Add
												</Button>
											</div>
										</div>
									)}
								</div>
							</PopoverContent>
						</Popover>
					</div>
				)}

				{/* Emoji Icon - shown above title */}
				{showMetadata && (
					<div className='block'>
						<EmojiIconPicker
							value={icon}
							onChange={(value) => setIcon?.(value)}
							className={cn(
								icon
									? 'text-5xl h-auto p-1 hover:bg-muted/50 -ml-2'
									: 'text-muted-foreground opacity-60 hover:opacity-100 transition-opacity h-7 px-2 text-xs -ml-2'
							)}
						/>
					</div>
				)}

				{/* Title Input */}
				<input
					type='text'
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder='Untitled'
					className='w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 text-foreground'
				/>
			</div>

			{/* Info Block */}
			{showMetadata && (
				<Collapsible
					open={isInfoOpen}
					onOpenChange={setIsInfoOpen}
					className='px-8 space-y-3'
				>
					<div className='flex items-center gap-2'>
						<CollapsibleTrigger asChild>
							<Button
								variant='ghost'
								size='sm'
								className='-ml-2 h-7 text-muted-foreground hover:text-foreground'
							>
								{isInfoOpen ? (
									<ChevronDown className='w-4 h-4 mr-1' />
								) : (
									<ChevronRight className='w-4 h-4 mr-1' />
								)}
								Info
							</Button>
						</CollapsibleTrigger>
						{!isInfoOpen && (
							<div className='flex items-center gap-3 text-xs text-muted-foreground animate-in fade-in slide-in-from-left-2'>
								<span className='flex items-center'>
									<Calendar className='w-3 h-3 mr-1' /> {formatDate(createdAt)}
								</span>
								{tags.length > 0 && (
									<span className='flex items-center'>
										<TagIcon className='w-3 h-3 mr-1' /> {tags.length} tags
									</span>
								)}
							</div>
						)}
					</div>

					<CollapsibleContent className='space-y-3 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'>
						<div>
							<Separator className='mb-4 bg-border/50' />

							{/* Top Properties Grid */}
							<div className='grid grid-cols-[120px_1fr] gap-y-4 gap-x-4 text-sm items-center'>
								{/* Tags */}
								<div className='flex items-center text-muted-foreground'>
									<TagIcon className='w-4 h-4 mr-2' />
									Tags
								</div>
								<div className='min-h-[28px]'>
									{setTags ? (
										<TagAutocompleteInput
											value={tags}
											onChange={setTags}
											placeholder='Add tags...'
										/>
									) : (
										<span className='text-xs text-muted-foreground/50 italic'>
											No tags
										</span>
									)}
								</div>

								{/* Created */}
								<div className='flex items-center text-muted-foreground'>
									<Calendar className='w-4 h-4 mr-2' />
									Created
								</div>
								<div className='text-foreground/80'>{formatDate(createdAt)}</div>

								{/* Updated */}

								<div className='flex items-center text-muted-foreground'>
									<Clock className='w-4 h-4 mr-2' />
									Updated
								</div>
								<div className='text-foreground/80'>{formatDate(updatedAt)}</div>
							</div>
						</div>
					</CollapsibleContent>
				</Collapsible>
			)}

			<Separator className='bg-border/30 mx-8 mt-6' />
		</div>
	)
}
