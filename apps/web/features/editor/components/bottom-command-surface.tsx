'use client'

import { BlockNoteEditor } from '@blocknote/core'
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator
} from '@skriuw/ui'
import {
	FileText,
	Hash,
	List,
	ListOrdered,
	CheckSquare,
	Code,
	Quote,
	Image,
	Link as LinkIcon,
	FileIcon,
	Archive,
	Trash2,
	Plus
} from 'lucide-react'

export type BlockKind =
	| 'heading'
	| 'paragraph'
	| 'bulletList'
	| 'numberedList'
	| 'checkList'
	| 'code'
	| 'quote'
	| 'image'

export type SurfaceContext = {
	editor: BlockNoteEditor | null
	noteId: string
	cursor: { x: number; y: number } | null
}

type CommandSurfaceProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	context: SurfaceContext
	onCreate: () => Promise<void>
	onInsert: (kind: BlockKind, context: SurfaceContext) => void
	onLink: (url: string, context: SurfaceContext) => void
	onNotes: () => void
	onFiles: () => void
	onArchive: (context: SurfaceContext) => Promise<void>
	onDelete: (context: SurfaceContext) => Promise<void>
}

const blockTypes: Array<{
	kind: BlockKind
	label: string
	icon: React.ComponentType<{ className?: string }>
	keywords: string[]
}> = [
	{
		kind: 'heading',
		label: 'Heading',
		icon: Hash,
		keywords: ['heading', 'title', 'h1', 'h2', 'h3']
	},
	{
		kind: 'paragraph',
		label: 'Paragraph',
		icon: FileText,
		keywords: ['paragraph', 'text', 'p']
	},
	{
		kind: 'bulletList',
		label: 'Bullet List',
		icon: List,
		keywords: ['bullet', 'list', 'ul', 'unordered']
	},
	{
		kind: 'numberedList',
		label: 'Numbered List',
		icon: ListOrdered,
		keywords: ['numbered', 'list', 'ol', 'ordered']
	},
	{
		kind: 'checkList',
		label: 'Check List',
		icon: CheckSquare,
		keywords: ['check', 'todo', 'task', 'checkbox']
	},
	{
		kind: 'code',
		label: 'Code Block',
		icon: Code,
		keywords: ['code', 'snippet', 'pre']
	},
	{
		kind: 'quote',
		label: 'Quote',
		icon: Quote,
		keywords: ['quote', 'blockquote', 'citation']
	},
	{
		kind: 'image',
		label: 'Image',
		icon: Image,
		keywords: ['image', 'picture', 'photo', 'img']
	}
]

export function createBlock(kind: BlockKind): any {
	const baseBlock = {
		id: crypto.randomUUID(),
		props: {
			backgroundColor: 'default',
			textColor: 'default',
			textAlignment: 'left'
		},
		content: [],
		children: []
	}

	switch (kind) {
		case 'heading':
			return {
				...baseBlock,
				type: 'heading',
				props: {
					...baseBlock.props,
					level: 1
				}
			}
		case 'paragraph':
			return {
				...baseBlock,
				type: 'paragraph'
			}
		case 'bulletList':
			return {
				...baseBlock,
				type: 'bulletListItem'
			}
		case 'numberedList':
			return {
				...baseBlock,
				type: 'numberedListItem'
			}
		case 'checkList':
			return {
				...baseBlock,
				type: 'checkListItem',
				props: {
					...baseBlock.props,
					checked: false
				}
			}
		case 'code':
			return {
				...baseBlock,
				type: 'codeBlock',
				props: {
					...baseBlock.props,
					language: 'javascript'
				}
			}
		case 'quote':
			return {
				...baseBlock,
				type: 'quote'
			}
		case 'image':
			return {
				...baseBlock,
				type: 'image',
				props: {
					...baseBlock.props,
					url: '',
					caption: '',
					showPreview: true,
					previewWidth: 512
				}
			}
		default:
			return {
				...baseBlock,
				type: 'paragraph'
			}
	}
}

export function CommandSurface({
	open,
	onOpenChange,
	context,
	onCreate,
	onInsert,
	onLink,
	onNotes,
	onFiles,
	onArchive,
	onDelete
}: CommandSurfaceProps) {
	const handleSelect = async (callback: () => void | Promise<void>) => {
		await callback()
		onOpenChange(false)
	}

	return (
		<CommandDialog open={open} onOpenChange={onOpenChange}>
			<CommandInput placeholder="Type a command or search..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>

				<CommandGroup heading="Actions">
					<CommandItem onSelect={() => handleSelect(onCreate)}>
						<Plus className="mr-2 h-4 w-4" />
						<span>New Note</span>
					</CommandItem>
					<CommandItem onSelect={() => handleSelect(onNotes)}>
						<FileText className="mr-2 h-4 w-4" />
						<span>Go to Notes</span>
					</CommandItem>
					<CommandItem onSelect={() => handleSelect(onFiles)}>
						<FileIcon className="mr-2 h-4 w-4" />
						<span>Open Files</span>
					</CommandItem>
				</CommandGroup>

				<CommandSeparator />

				<CommandGroup heading="Insert Blocks">
					{blockTypes.map((block) => (
						<CommandItem
							key={block.kind}
							onSelect={() => handleSelect(() => onInsert(block.kind, context))}
							keywords={block.keywords}
						>
							<block.icon className="mr-2 h-4 w-4" />
							<span>{block.label}</span>
						</CommandItem>
					))}
				</CommandGroup>

				<CommandSeparator />

				<CommandGroup heading="Note Management">
					<CommandItem
						onSelect={() => handleSelect(() => onArchive(context))}
						className="text-yellow-600 dark:text-yellow-500"
					>
						<Archive className="mr-2 h-4 w-4" />
						<span>Archive Note</span>
					</CommandItem>
					<CommandItem
						onSelect={() => handleSelect(() => onDelete(context))}
						className="text-destructive"
					>
						<Trash2 className="mr-2 h-4 w-4" />
						<span>Delete Note</span>
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	)
}
