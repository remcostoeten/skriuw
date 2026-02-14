'use client'

import {
	getInitialNoteContent,
	type NoteTemplate
} from '@/features/notes/utils/get-initial-note-content'
import { useSettings } from '@/features/settings'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@skriuw/shared'
import { Button, Popover, PopoverContent, PopoverTrigger, Separator } from '@skriuw/ui'
import { useConfirmDialog } from '@skriuw/ui/confirm-dialog'
import { Sparkles, LayoutTemplate, Share2, Settings, Info } from 'lucide-react'
import type { BlockNoteEditor } from '@blocknote/core'
import { useMemo } from 'react'

type NoteFooterBarProps = {
	editor: BlockNoteEditor | null
	className?: string
}

const TEMPLATE_OPTIONS: { value: NoteTemplate; label: string; description: string }[] = [
	{ value: 'empty', label: 'Empty', description: 'Start with a blank page' },
	{ value: 'h1', label: 'Title', description: 'Single H1 to begin writing' },
	{ value: 'h2', label: 'Heading', description: 'Single H2 to begin writing' },
	{ value: 'meeting', label: 'Meeting', description: 'Agenda + action items' },
	{ value: 'journal', label: 'Journal', description: 'Daily reflection template' },
	{ value: 'project', label: 'Project', description: 'Goals + tasks + notes' }
]

export function NoteFooterBar({ editor, className }: NoteFooterBarProps) {
	const { setSetting, getSetting } = useSettings()
	const { setRightSidebarOpen, setSettingsOpen } = useUIStore()
	const defaultTemplate = (getSetting('defaultNoteTemplate') ?? 'empty') as NoteTemplate
	const { confirm, ConfirmDialog } = useConfirmDialog()

	const isEmptyBlock = (block: any) => {
		if (!block) return true
		const content = block.content
		if (!content || (Array.isArray(content) && content.length === 0)) return true
		if (Array.isArray(content)) {
			return content.every((item) => {
				if (!item) return true
				if (typeof item === 'string') return item.trim().length === 0
				if (typeof item.text === 'string') return item.text.trim().length === 0
				return false
			})
		}
		if (typeof content === 'string') return content.trim().length === 0
		return false
	}

	const isEffectivelyEmpty = (blocks: any[] | undefined) => {
		if (!blocks || blocks.length === 0) return true
		return blocks.every((block) => isEmptyBlock(block))
	}

	const insertTemplate = async (template: NoteTemplate) => {
		if (!editor) return
		const hasContent = !isEffectivelyEmpty(editor.document)
		if (hasContent) {
			const shouldReplace = await confirm({
				title: 'Replace page content?',
				description: 'This will overwrite the current page with the selected template.',
				confirmLabel: 'Replace',
				cancelLabel: 'Cancel'
			})
			if (!shouldReplace) return
		}
		const blocks = getInitialNoteContent(template)
		if (editor.document?.length) {
			editor.replaceBlocks(editor.document, blocks as any)
		} else {
			editor.insertBlocks(blocks as any, blocks[0] as any, 'after')
		}
		const firstBlock = editor.document?.[0]
		if (firstBlock) {
			editor.setTextCursorPosition(firstBlock, 'end')
		}
	}

	const defaultTemplateLabel = useMemo(() => {
		return TEMPLATE_OPTIONS.find((option) => option.value === defaultTemplate)?.label ?? 'Empty'
	}, [defaultTemplate])

	return (
		<>
			<ConfirmDialog />
			<div
				className={cn(
					'border-t border-border/40 px-6 py-3 text-xs text-muted-foreground',
					className
				)}
			>
				<div className='flex flex-wrap items-center gap-2'>
					<span className='text-xs text-muted-foreground/80'>Get started with</span>

					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant='secondary'
								size='sm'
								className='h-7 px-2.5 text-xs rounded-full'
							>
								<LayoutTemplate className='mr-1.5 h-3.5 w-3.5' />
								Templates
							</Button>
						</PopoverTrigger>
						<PopoverContent className='w-72 p-2' align='start'>
							<div className='space-y-2'>
								<div className='px-2 text-xs font-medium text-muted-foreground'>
									Insert template
								</div>
								<div className='space-y-1'>
									{TEMPLATE_OPTIONS.map((option) => (
										<button
											key={option.value}
											type='button'
											className='w-full rounded-md px-2 py-2 text-left hover:bg-accent transition-colors'
											onClick={() => insertTemplate(option.value)}
										>
											<div className='text-sm text-foreground'>
												{option.label}
											</div>
											<div className='text-xs text-muted-foreground'>
												{option.description}
											</div>
										</button>
									))}
								</div>

								<Separator className='my-2' />

								<div className='px-2 text-xs font-medium text-muted-foreground'>
									Default template
								</div>
								<div className='space-y-1'>
									{TEMPLATE_OPTIONS.map((option) => (
										<button
											key={`${option.value}-default`}
											type='button'
											className={cn(
												'w-full rounded-md px-2 py-1.5 text-left transition-colors',
												defaultTemplate === option.value
													? 'bg-accent text-foreground'
													: 'hover:bg-accent'
											)}
											onClick={() =>
												setSetting('defaultNoteTemplate', option.value)
											}
										>
											<div className='flex items-center justify-between text-xs'>
												<span>{option.label}</span>
												{defaultTemplate === option.value ? (
													<span className='text-[10px] uppercase tracking-wide'>
														Default
													</span>
												) : null}
											</div>
										</button>
									))}
								</div>
							</div>
						</PopoverContent>
					</Popover>

					<Button
						variant='secondary'
						size='sm'
						className='h-7 px-2.5 text-xs rounded-full'
						onClick={() => setRightSidebarOpen(true)}
					>
						<Share2 className='mr-1.5 h-3.5 w-3.5' />
						Share
					</Button>

					<Button
						variant='secondary'
						size='sm'
						className='h-7 px-2.5 text-xs rounded-full'
						onClick={() => setSettingsOpen(true)}
					>
						<Settings className='mr-1.5 h-3.5 w-3.5' />
						Settings
					</Button>

					<Button
						variant='secondary'
						size='sm'
						className='h-7 px-2.5 text-xs rounded-full'
						onClick={() => setRightSidebarOpen(true)}
					>
						<Info className='mr-1.5 h-3.5 w-3.5' />
						Details
					</Button>

					<Button
						variant='secondary'
						size='sm'
						className='h-7 px-2.5 text-xs rounded-full opacity-60 cursor-not-allowed'
						disabled
					>
						<Sparkles className='mr-1.5 h-3.5 w-3.5' />
						Ask AI (soon)
					</Button>

					<span className='ml-auto text-[11px] text-muted-foreground/70 hidden sm:inline'>
						Default: {defaultTemplateLabel}
					</span>
				</div>
			</div>
		</>
	)
}
