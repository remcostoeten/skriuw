import * as React from 'react'
import {
	Smile,
	Calendar,
	Clock,
	Tag,
	ChevronDown,
	ChevronRight,
	Image as ImageIcon,
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
	Separator,
	Badge,
} from '@skriuw/ui'

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
}

const EMOJIS = ['😀', '😂', '🥰', '😎', '🤔', '🚀', '💡', '📝', '✅', '🎨', '🔥', '✨', '🎉', '💻', '🤖', '🌲', '🍕', '☕', '📚', '⚡']

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
}: Props) {
	const [isIconPickerOpen, setIsIconPickerOpen] = React.useState(false)
	const [isInfoOpen, setIsInfoOpen] = React.useState(true)
	const [tagInput, setTagInput] = React.useState('')
	const tagInputRef = React.useRef<HTMLInputElement | null>(null)

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
			label = d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
		}

		const time = d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
		return `${label} • ${time}`
	}

	return (
		<div className={cn("group w-full space-y-6", className)}>
			{/* Cover Image */}
			<div className={cn("relative w-full group/cover", coverImage ? "h-48" : "h-0")}>
				{coverImage && (
					<>
						<img
							src={coverImage}
							alt="Cover"
							className="w-full h-full object-cover"
						/>
						<div className="absolute bottom-2 right-2 opacity-0 group-hover/cover:opacity-100 transition-opacity flex gap-2">
							<Button
								variant="secondary"
								size="sm"
								className="h-6 text-xs bg-background/80 hover:bg-background"
								onClick={() => setCoverImage?.(undefined)}
							>
								Remove
							</Button>
						</div>
					</>
				)}
				{/* Add Cover Button (shows when hovering header area if no cover, or always if showMetadata is true? logic needs refinement similar to Notion) */}
			</div>

			<div className="px-6 pb-4 space-y-6">
				{showMetadata && !coverImage && (
					<div className="flex items-center gap-2 text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mb-[-1rem]">
						<label className="cursor-pointer flex items-center gap-1 h-6 px-2 -ml-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
							<ImageIcon className="w-3 h-3" />
							Add cover
							<input
								type="file"
								accept="image/*"
								className="sr-only"
								onChange={async (e) => {
									const file = e.target.files?.[0]
									if (file && onCoverUpload) {
										onCoverUpload(file)
									}
								}}
							/>
						</label>
					</div>
				)}


				{/* Icon & Title Section */}
				<div className="space-y-4">
					{/* Icon Trigger */}
					{showMetadata && (
						<div className="h-8 flex items-center">
							<Popover open={isIconPickerOpen} onOpenChange={setIsIconPickerOpen}>
								<PopoverTrigger asChild>
									<Button
										variant="ghost"
										size={icon ? "default" : "sm"}
										className={cn(
											icon
												? "text-4xl h-auto p-2 hover:bg-muted/50 -ml-2"
												: "text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity -ml-3"
										)}
									>
										{icon ? (
											icon
										) : (
											<>
												<Smile className="w-4 h-4 mr-2" />
												Add icon
											</>
										)}
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-64 p-2" align="start">
									<div className="grid grid-cols-5 gap-1">
										{EMOJIS.map(emoji => (
											<Button
												key={emoji}
												variant="ghost"
												size="sm"
												className="h-8 w-8 p-0 text-lg"
												onClick={() => {
													setIcon?.(emoji)
													setIsIconPickerOpen(false)
												}}
											>
												{emoji}
											</Button>
										))}
									</div>
									{icon && (
										<Button
											variant="ghost"
											size="sm"
											className="w-full mt-2 text-xs text-muted-foreground"
											onClick={() => {
												setIcon?.(undefined)
												setIsIconPickerOpen(false)
											}}
										>
											Remove icon
										</Button>
									)}
								</PopoverContent>
							</Popover>
						</div>
					)}

					{/* Title Input */}
					<input
						type="text"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Untitled"
						className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 text-foreground"
					/>
				</div>

				{/* Info Block */}
				{showMetadata && (
					<Collapsible open={isInfoOpen} onOpenChange={setIsInfoOpen} className="space-y-4">
						<div className="flex items-center gap-2">
							<CollapsibleTrigger asChild>
								<Button variant="ghost" size="sm" className="-ml-3 h-6 text-muted-foreground hover:text-foreground">
									{isInfoOpen ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
									Info
								</Button>
							</CollapsibleTrigger>
							{!isInfoOpen && (
								<div className="flex items-center gap-2 text-xs text-muted-foreground animate-in fade-in slide-in-from-left-2">
									<span className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {formatDate(createdAt)}</span>
									{tags.length > 0 && <span className="flex items-center"><Tag className="w-3 h-3 mr-1" /> {tags.length} tags</span>}
								</div>
							)}
						</div>

						<CollapsibleContent className="space-y-4 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
							<div className="pl-1">
								<Separator className="mb-4 bg-border/50" />

								{/* Top Properties Grid */}
								<div className="grid grid-cols-[120px_1fr] gap-y-3 gap-x-4 text-sm items-center">
									{/* Tags */}
									<div className="flex items-center text-muted-foreground">
										<Tag className="w-4 h-4 mr-2" />
										Tags
									</div>
									<div className="flex items-center flex-wrap gap-1">
										{tags.length > 0 ? (
											tags.map(tag => (
												<Badge key={tag} variant="secondary" className="bg-muted text-muted-foreground hover:bg-muted/80 rounded-sm font-normal text-xs px-1.5 flex items-center gap-1">
													{tag}
													{setTags && (
														<button
															type="button"
															className="ml-1 text-muted-foreground/70 hover:text-foreground"
															onClick={() => setTags(tags.filter((current) => current !== tag))}
														>
															&times;
														</button>
													)}
												</Badge>
											))
										) : (
											<div
												className="text-muted-foreground/50 italic flex items-center text-xs cursor-pointer hover:text-muted-foreground transition-colors"
												onClick={() => tagInputRef.current?.focus()}
											>
												Empty
											</div>
										)}
										{setTags && (
											<input
												ref={tagInputRef}
												type="text"
												value={tagInput}
												onChange={(event) => setTagInput(event.target.value)}
												onKeyDown={(event) => {
													if (event.key !== 'Enter' && event.key !== ',') return
													event.preventDefault()
													const nextTag = tagInput.trim().replace(/,$/, '')
													if (!nextTag) return
													const hasTag = tags.some((existing) => existing.toLowerCase() === nextTag.toLowerCase())
													if (!hasTag) {
														setTags([...tags, nextTag])
													}
													setTagInput('')
												}}
												onBlur={() => {
													const nextTag = tagInput.trim()
													if (!nextTag) return
													const hasTag = tags.some((existing) => existing.toLowerCase() === nextTag.toLowerCase())
													if (!hasTag) {
														setTags([...tags, nextTag])
													}
													setTagInput('')
												}}
												placeholder={tags.length === 0 ? 'Add tags...' : ''}
												className="min-w-[120px] bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
											/>
										)}
									</div>

									{/* Created */}
									<div className="flex items-center text-muted-foreground">
										<Calendar className="w-4 h-4 mr-2" />
										Created
									</div>
									<div className="text-foreground/80">{formatDate(createdAt)}</div>

									{/* Updated */}
									<div className="flex items-center text-muted-foreground">
										<Clock className="w-4 h-4 mr-2" />
										Updated
									</div>
									<div className="text-foreground/80">{formatDate(updatedAt)}</div>
								</div>

							</div>
						</CollapsibleContent>
					</Collapsible>
				)}

				<Separator className="bg-border/30 mt-8" />
			</div>
		</div>
	)
}
