import { type ComponentProps as BlockNoteComponentProps, type Components } from '@blocknote/react'
import React, { forwardRef } from 'react'

import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from '@skriuw/ui/dropdown-menu'
import { Input } from '@skriuw/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@skriuw/ui/popover'

import { cn } from '@skriuw/shared'

const ToolbarRoot = forwardRef<
	HTMLDivElement,
	BlockNoteComponentProps['FormattingToolbar']['Root']
>(({ className, children, onMouseEnter, onMouseLeave }, ref) => {
	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const toolbar = event.currentTarget
		const buttons = Array.from(
			toolbar.querySelectorAll('button:not([disabled])')
		) as HTMLButtonElement[]

		if (buttons.length === 0) return

		const currentIndex = buttons.findIndex((btn) => btn === document.activeElement)
		let nextIndex = currentIndex

		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				event.preventDefault()
				nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % buttons.length
				break
			case 'ArrowLeft':
			case 'ArrowUp':
				event.preventDefault()
				nextIndex = currentIndex === -1 ? buttons.length - 1 : (currentIndex - 1 + buttons.length) % buttons.length
				break
			case 'Home':
				event.preventDefault()
				nextIndex = 0
				break
			case 'End':
				event.preventDefault()
				nextIndex = buttons.length - 1
				break
			default:
				return
		}

		buttons[nextIndex]?.focus()
	}

	return (
		<div
			ref={ref}
			role="toolbar"
			aria-label="Formatting options"
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			onKeyDown={handleKeyDown}
			className={cn(
				'bn-toolbar flex flex-wrap items-center gap-px rounded-lg border border-border/40 bg-popover/95 px-1 py-0.5 shadow-lg backdrop-blur-md max-w-full',
				'max-sm:w-full max-sm:justify-center max-sm:gap-1 max-sm:px-1.5 max-sm:py-1',
				className
			)}
		>
			{children}
		</div>
	)
})


const ToolbarButton = ({
	className,
	children,
	label,
	icon,
	onClick,
	isSelected,
	isDisabled,
	mainTooltip,
	secondaryTooltip,
}: BlockNoteComponentProps['FormattingToolbar']['Button']) => {
	return (
		<button
			type="button"
			tabIndex={0}
			className={cn(
				'bn-toolbar-button inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
				'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover',
				'max-sm:h-8 max-sm:min-w-8 max-sm:px-2',
				isSelected && 'bg-accent text-foreground',
				isDisabled && 'cursor-not-allowed opacity-40',
				className
			)}
			disabled={isDisabled}
			aria-pressed={isSelected}
			title={secondaryTooltip || mainTooltip || label}
			onClick={(event) => {
				if (isDisabled) return
				onClick?.(event as any)
			}}
			onKeyDown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault()
					if (!isDisabled) {
						onClick?.(event as any)
					}
				}
			}}
		>
			{icon}
			{label && !children ? <span className="ml-0.5">{label}</span> : children}
		</button>
	)
}

const ToolbarSelect = ({
	className,
	items,
	isDisabled,
}: BlockNoteComponentProps['FormattingToolbar']['Select']) => {
	const selected = items.find((item) => item.isSelected) ?? items[0]

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						'bn-toolbar-select inline-flex h-7 items-center justify-between rounded px-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground',
						'max-sm:h-8 max-sm:px-2',
						isDisabled && 'cursor-not-allowed opacity-40',
						className
					)}
					disabled={isDisabled}
				>
					<span className="flex items-center gap-0.5">
						{selected?.icon}
						<span className="bn-toolbar-select-text">{selected?.text}</span>
					</span>
					<span className="bn-toolbar-select-arrow text-muted-foreground">v</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bn-toolbar-select-menu">
				{items.map((item) => (
					<DropdownMenuItem
						key={item.text}
						data-selected={item.isSelected ? '' : undefined}
						className={cn(item.isSelected && 'bg-muted text-primary')}
						onSelect={(event) => {
							event.preventDefault()
							if (item.isDisabled) return
							item.onClick?.()
						}}
					>
						<span className="mr-2 inline-flex items-center gap-1">
							{item.icon}
							{item.text}
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

const SideMenuRoot = ({ className, children }: BlockNoteComponentProps['SideMenu']['Root']) => (
	<div
		className={cn(
			'bn-side-menu flex flex-col items-center gap-0.5 rounded bg-transparent p-0',
			'max-sm:flex-row max-sm:gap-1',
			className
		)}
	>
		{children}
	</div>
)

const SideMenuButton = forwardRef<HTMLButtonElement, BlockNoteComponentProps['SideMenu']['Button']>(
	({ className, icon, label, onClick, draggable, onDragEnd, onDragStart, children }, ref) => (
		<button
			ref={ref}
			type="button"
			draggable={draggable}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			className={cn(
				'bn-side-menu-button flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-muted-foreground hover:bg-accent/50',
				'max-sm:h-6 max-sm:w-6',
				className
			)}
			onClick={onClick}
			title={label}
		>
			{icon || children}
		</button>
	)
)
SideMenuButton.displayName = 'SideMenuButton'

const SuggestionMenuRoot = ({
	id,
	className,
	children,
}: BlockNoteComponentProps['SuggestionMenu']['Root']) => (
	<div
		id={id}
		className={cn(
			'bn-suggestion-menu min-w-[min(320px,92vw)] max-w-[92vw]',
			'rounded-none border border-border/50 bg-background/98',
			'p-3 text-sm shadow-2xl backdrop-blur-xl rounded-md',
			'max-sm:p-4 max-sm:text-base max-sm:rounded-lg',
			'ring-1 ring-black/5 dark:ring-white/10',
			'animate-in fade-in-0 zoom-in-95 duration-200',
			'max-h-[60vh] overflow-y-auto',
			'scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent',
			className
		)}
	>
		{children}
	</div>
)

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function getItemText(value: unknown): string | undefined {
	if (typeof value === 'string') return value
	if (typeof value === 'number') return String(value)
	if (!isRecord(value)) return undefined
	if (typeof value.name === 'string') return value.name
	if (typeof value.label === 'string') return value.label
	return undefined
}

function getItemTitle(item: unknown): string {
	if (!isRecord(item)) return String(item)
	return (
		getItemText(item.title) ||
		getItemText(item.label) ||
		getItemText(item.name) ||
		String(item)
	)
}

function getItemIcon(item: unknown): React.ReactNode {
	if (!isRecord(item)) return '•'
	const icon = item.icon
	if (React.isValidElement(icon)) return icon
	if (typeof icon === 'string' || typeof icon === 'number') return icon
	const emoji = getItemText(item.emoji)
	if (emoji) return emoji
	const native = getItemText(item.native)
	if (native) return native
	return '•'
}

function getItemDesc(item: unknown): string | undefined {
	if (!isRecord(item)) return undefined
	return getItemText(item.description) || getItemText(item.subtext)
}

const SuggestionMenuItem = ({
	className,
	isSelected,
	onClick,
	item,
}: BlockNoteComponentProps['SuggestionMenu']['Item']) => {
	const title = getItemTitle(item)
	const description = getItemDesc(item)
	const icon = getItemIcon(item)

	// Determine category based on title for better organization
	function getCategory(title: string) {
		if (
			title.includes('Heading') ||
			title.includes('Paragraph') ||
			title.includes('Quote') ||
			title.includes('Text')
		)
			return 'Text'
		if (title.includes('List') || title.includes('Task') || title.includes('Todo')) return 'Lists'
		if (title.includes('Image') || title.includes('Video') || title.includes('Media'))
			return 'Media'
		if (title.includes('Code') || title.includes('Table') || title.includes('Advanced'))
			return 'Advanced'
		if (title.includes('Animated') || title.includes('Custom')) return 'Custom'
		return 'Basic'
	}

	const category = getCategory(title)
	const categoryColors = {
		Text: 'text-foreground',
		Lists: 'text-foreground',
		Media: 'text-foreground',
		Advanced: 'text-foreground',
		Custom: 'text-foreground',
		Basic: 'text-foreground',
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'bn-suggestion-item flex w-full items-start gap-3 rounded-lg px-3 py-2',
				'text-left text-sm transition-all duration-150',
				'max-sm:px-3.5 max-sm:py-3 max-sm:text-base',
				'hover:bg-accent/90 hover:shadow-sm',
				'active:scale-[0.98] active:bg-accent',
				'border border-transparent hover:border-border/50',
				isSelected &&
				'bg-accent text-accent-foreground shadow-md ring-1 ring-primary/20 border-border/50',
				!isSelected && 'text-foreground',
				className
			)}
		>
			<div
				className={cn(
					'mt-0.5 shrink-0 text-lg opacity-80 flex items-center justify-center w-5 h-5',
					categoryColors[category as keyof typeof categoryColors]
				)}
			>
				{icon || '•'}
			</div>
			<div className="flex-1 min-w-0">
				<div className="font-semibold leading-tight flex items-center gap-2">
					{title}
					<span
						className={cn(
							'text-xs px-1.5 py-0.5 rounded-full opacity-60',
							'bg-muted text-muted-foreground'
						)}
					>
						{category}
					</span>
				</div>
				{description && (
					<div className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-1">
						{description}
					</div>
				)}
			</div>
		</button>
	)
}

const SuggestionMenuEmpty = ({
	className,
	children,
}: BlockNoteComponentProps['SuggestionMenu']['EmptyItem']) => (
	<div className={cn('bn-suggestion-empty px-2 py-1 text-sm text-muted-foreground', className)}>
		{children}
	</div>
)

const SuggestionMenuLabel = ({
	className,
	children,
}: BlockNoteComponentProps['SuggestionMenu']['Label']) => (
	<div
		className={cn(
			'bn-suggestion-label px-3 py-2 text-xs uppercase tracking-wide font-semibold',
			'text-muted-foreground bg-muted/50 rounded-md mb-1',
			'max-sm:text-sm max-sm:px-3.5',
			'border border-border/30 sticky top-0 z-10 backdrop-blur-sm',
			className
		)}
	>
		{children}
	</div>
)

const SuggestionMenuLoader = ({
	className,
}: BlockNoteComponentProps['SuggestionMenu']['Loader']) => (
	<div className={cn('bn-suggestion-loader px-2 py-2 text-sm text-muted-foreground', className)}>
		Loading...
	</div>
)

const GridSuggestionMenuRoot = ({
	id,
	className,
	columns,
	children,
}: BlockNoteComponentProps['GridSuggestionMenu']['Root']) => (
	<div
		id={id}
		className={cn(
			'bn-grid-suggestion-menu rounded-xl border border-border/50 bg-background/98',
			'p-3 shadow-2xl backdrop-blur-xl',
			'ring-1 ring-black/5 dark:ring-white/10',
			'animate-in fade-in-0 zoom-in-95 duration-200',
			className
		)}
		style={{
			display: 'grid',
			gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
			gap: '0.5rem',
		}}
	>
		{children}
	</div>
)

const GridSuggestionMenuItem = ({
	className,
	isSelected,
	onClick,
	item,
}: BlockNoteComponentProps['GridSuggestionMenu']['Item']) => (
	<button
		type="button"
		onClick={onClick}
		className={cn(
			'bn-grid-suggestion-item flex flex-col items-center justify-center',
			'rounded-lg border border-transparent bg-muted/50',
			'p-3.5 text-xs transition-all duration-150',
			'hover:border-border hover:bg-muted/80 hover:shadow-md',
			'active:scale-[0.96]',
			isSelected &&
			'border-primary/60 bg-accent text-accent-foreground shadow-lg ring-2 ring-primary/30 scale-[1.02]',
			className
		)}
	>
		<div className="text-2xl mb-2 opacity-90 transition-transform duration-150 group-hover:scale-110">
			{getItemIcon(item)}
		</div>
		<span className="font-semibold truncate w-full text-center leading-tight">
			{getItemTitle(item)}
		</span>
	</button>
)

const GridSuggestionMenuEmpty = ({
	className,
	children,
}: BlockNoteComponentProps['GridSuggestionMenu']['EmptyItem']) => (
	<div
		className={cn(
			'bn-grid-suggestion-empty col-span-full text-center text-sm text-muted-foreground',
			className
		)}
	>
		{children}
	</div>
)

const GridSuggestionMenuLoader = ({
	className,
	columns,
}: BlockNoteComponentProps['GridSuggestionMenu']['Loader']) => (
	<div
		className={cn(
			'bn-grid-suggestion-loader col-span-full text-center text-sm text-muted-foreground',
			className
		)}
		style={{ gridColumn: `span ${columns}` }}
	>
		Loading...
	</div>
)

const TableHandleRoot = ({
	className,
	children,
	draggable,
	onDragEnd,
	onDragStart,
}: BlockNoteComponentProps['TableHandle']['Root']) => (
	<div
		className={cn(
			'bn-table-handle flex cursor-grab select-none items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-xs shadow',
			className
		)}
		draggable={draggable}
		onDragStart={onDragStart}
		onDragEnd={onDragEnd}
	>
		{children}
	</div>
)

const TableExtendButton = ({
	className,
	onClick,
	onMouseDown,
	children,
}: BlockNoteComponentProps['TableHandle']['ExtendButton']) => (
	<button
		type="button"
		className={cn(
			'bn-table-extend-button rounded-md border border-border bg-muted px-2 py-1 text-xs',
			className
		)}
		onClick={onClick}
		onMouseDown={onMouseDown}
	>
		{children}
	</button>
)

const FilePanelRoot = ({ className, ...props }: BlockNoteComponentProps['FilePanel']['Root']) => (
	<div
		className={cn(
			'bn-file-panel rounded-xl border border-border bg-background p-4 shadow',
			className
		)}
	>
		{'tabs' in props && props.tabs.map((tab: any) => <div key={tab.name}>{tab.tabPanel}</div>)}
	</div>
)

const FilePanelButton = ({
	className,
	onClick,
	children,
	label,
}: BlockNoteComponentProps['FilePanel']['Button']) => (
	<button
		type="button"
		className={cn(
			'bn-file-panel-button inline-flex items-center justify-center rounded-md border border-border bg-muted px-3 py-1 text-sm font-medium',
			className
		)}
		onClick={onClick}
	>
		{children || label}
	</button>
)

const FilePanelInput = ({
	className,
	placeholder,
	onChange,
	value,
	onKeyDown,
	...rest
}: BlockNoteComponentProps['FilePanel']['TextInput']) => (
	<Input
		className={cn('bn-file-panel-input', className)}
		placeholder={placeholder}
		value={value}
		onChange={onChange}
		onKeyDown={onKeyDown}
		{...rest}
	/>
)

const FilePanelFileInput = ({
	className,
	onChange,
	accept,
}: BlockNoteComponentProps['FilePanel']['FileInput']) => (
	<input
		type="file"
		className={cn('bn-file-panel-file-input text-sm', className)}
		accept={accept}
		onChange={(event) => onChange?.(event.target.files?.[0] ?? null)}
	/>
)

const FilePanelTab = ({
	className,
	children,
}: BlockNoteComponentProps['FilePanel']['TabPanel']) => (
	<div className={cn('bn-file-panel-tab space-y-2', className)}>{children}</div>
)

const BadgeRoot = ({
	className,
	text,
	icon,
	onClick,
}: BlockNoteComponentProps['Generic']['Badge']['Root']) => (
	<button
		type="button"
		onClick={onClick}
		className={cn(
			'bn-badge inline-flex items-center gap-2 rounded-full border border-border px-2 py-0.5 text-xs',
			className
		)}
	>
		{icon}
		<span>{text}</span>
	</button>
)

const BadgeGroup = ({
	className,
	children,
}: BlockNoteComponentProps['Generic']['Badge']['Group']) => (
	<div className={cn('bn-badge-group flex flex-wrap gap-1', className)}>{children}</div>
)

const FormRoot = ({ children }: BlockNoteComponentProps['Generic']['Form']['Root']) => (
	<div className="bn-form space-y-2">{children}</div>
)

const FormTextInput = ({
	className,
	placeholder,
	value,
	onChange,
	onKeyDown,
	icon,
	rightSection,
	disabled,
	...rest
}: BlockNoteComponentProps['Generic']['Form']['TextInput']) => (
	<div className={cn('bn-form-input relative flex items-center', className)}>
		{icon && <span className="pointer-events-none pl-2 text-muted-foreground">{icon}</span>}
		<Input
			className={cn(icon ? 'pl-8' : '', rightSection ? 'pr-8' : '')}
			placeholder={placeholder}
			value={value}
			disabled={disabled}
			onChange={onChange}
			onKeyDown={onKeyDown}
			{...rest}
		/>
		{rightSection && <span className="absolute right-2 text-muted-foreground">{rightSection}</span>}
	</div>
)

const MenuRoot = ({
	children,
	onOpenChange,
}: BlockNoteComponentProps['Generic']['Menu']['Root']) => (
	<DropdownMenu onOpenChange={onOpenChange}>{children}</DropdownMenu>
)

const MenuTrigger = ({ children }: BlockNoteComponentProps['Generic']['Menu']['Trigger']) => (
	<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
)

const MenuDropdown = ({
	className,
	children,
}: BlockNoteComponentProps['Generic']['Menu']['Dropdown']) => (
	<DropdownMenuContent className={cn('bn-menu min-w-[220px]', className)}>
		{children}
	</DropdownMenuContent>
)

const MenuItem = ({
	className,
	children,
	onClick,
	icon,
	...itemProps
}: BlockNoteComponentProps['Generic']['Menu']['Item']) => (
	<DropdownMenuItem
		className={className}
		{...itemProps}
		onSelect={(event) => {
			event.preventDefault()
			onClick?.()
		}}
	>
		{icon}
		{children}
	</DropdownMenuItem>
)

const MenuLabel = ({
	className,
	children,
}: BlockNoteComponentProps['Generic']['Menu']['Label']) => (
	<DropdownMenuLabel className={className}>{children}</DropdownMenuLabel>
)

const MenuDivider = ({ className }: BlockNoteComponentProps['Generic']['Menu']['Divider']) => (
	<DropdownMenuSeparator className={className} />
)

const MenuButton = ({
	className,
	children,
	onClick,
}: BlockNoteComponentProps['Generic']['Menu']['Button']) => (
	<button
		type="button"
		className={cn(
			'bn-menu-button inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted',
			className
		)}
		onClick={onClick}
	>
		{children}
	</button>
)

const PopoverRoot = ({
	children,
	open,
}: BlockNoteComponentProps['Generic']['Popover']['Root']) => (
	<Popover open={open}>{children}</Popover>
)

const PopoverTriggerWrapper = ({
	children,
}: BlockNoteComponentProps['Generic']['Popover']['Trigger']) => (
	<PopoverTrigger asChild>{children}</PopoverTrigger>
)

const PopoverContentWrapper = ({
	className,
	children,
}: BlockNoteComponentProps['Generic']['Popover']['Content']) => (
	<PopoverContent className={cn('bn-popover-content', className)}>{children}</PopoverContent>
)

const GenericToolbarRoot = ToolbarRoot
const GenericToolbarButton = ToolbarButton
const GenericToolbarSelect = ToolbarSelect

const CommentsCard = ({ className, children }: BlockNoteComponentProps['Comments']['Card']) => (
	<div
		className={cn(
			'bn-comments-card rounded-lg border border-border bg-background/95 p-3 shadow',
			className
		)}
	>
		{children}
	</div>
)

const CommentsCardSection = ({
	className,
	children,
}: BlockNoteComponentProps['Comments']['CardSection']) => (
	<div className={cn('bn-comments-card-section py-2', className)}>{children}</div>
)

const CommentsExpandPrompt = ({
	className,
	children,
}: BlockNoteComponentProps['Comments']['ExpandSectionsPrompt']) => (
	<div className={cn('bn-comments-expand text-xs text-muted-foreground', className)}>
		{children}
	</div>
)

const CommentsEditor = ({ className, ...props }: BlockNoteComponentProps['Comments']['Editor']) => (
	<div className={cn('bn-comments-editor', className)}>
		{/* Editor content is handled by BlockNote internally */}
	</div>
)

const CommentsComment = ({
	className,
	children,
}: BlockNoteComponentProps['Comments']['Comment']) => (
	<div
		className={cn(
			'bn-comments-comment rounded-md border border-border/60 bg-muted/40 p-2 text-sm',
			className
		)}
	>
		{children}
	</div>
)

export const shadcnComponents: Components = {
	FormattingToolbar: {
		Root: ToolbarRoot,
		Button: ToolbarButton,
		Select: ToolbarSelect,
	},
	LinkToolbar: {
		Root: ToolbarRoot,
		Button: ToolbarButton,
		Select: ToolbarSelect,
	},
	SideMenu: {
		Root: SideMenuRoot,
		Button: SideMenuButton,
	},
	SuggestionMenu: {
		Root: SuggestionMenuRoot,
		Item: SuggestionMenuItem,
		EmptyItem: SuggestionMenuEmpty,
		Label: SuggestionMenuLabel,
		Loader: SuggestionMenuLoader,
	},
	GridSuggestionMenu: {
		Root: GridSuggestionMenuRoot,
		Item: GridSuggestionMenuItem,
		EmptyItem: GridSuggestionMenuEmpty,
		Loader: GridSuggestionMenuLoader,
	},
	FilePanel: {
		Root: FilePanelRoot,
		Button: FilePanelButton,
		FileInput: FilePanelFileInput,
		TabPanel: FilePanelTab,
		TextInput: FilePanelInput,
	},
	TableHandle: {
		Root: TableHandleRoot,
		ExtendButton: TableExtendButton,
	},
	Comments: {
		Card: CommentsCard,
		CardSection: CommentsCardSection,
		ExpandSectionsPrompt: CommentsExpandPrompt,
		Editor: CommentsEditor,
		Comment: CommentsComment,
	},
	Generic: {
		Badge: {
			Root: BadgeRoot,
			Group: BadgeGroup,
		},
		Form: {
			Root: FormRoot,
			TextInput: FormTextInput,
		},
		Menu: {
			Root: MenuRoot,
			Trigger: MenuTrigger,
			Dropdown: MenuDropdown,
			Divider: MenuDivider,
			Item: MenuItem,
			Label: MenuLabel,
			Button: MenuButton,
		},
		Popover: {
			Root: PopoverRoot,
			Trigger: PopoverTriggerWrapper,
			Content: PopoverContentWrapper,
		},
		Toolbar: {
			Root: GenericToolbarRoot,
			Button: GenericToolbarButton,
			Select: GenericToolbarSelect,
		},
	},
} as Components
