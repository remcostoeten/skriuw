'use client'

import { useUIStore } from '../../stores/ui-store'
import { CollapsibleSection } from './collapsible-section'
import { useTableOfContents, useNoteMetadata, useShareUrl, useScrollToHeading } from './hooks'
import { TOCItem } from './toc-item'
import { SECTION_KEYS, type SectionKey, type RightSidebarProps } from './types'
import { useNotesContext } from '@/features/notes/context/notes-context'
import type { Note } from '@/features/notes/types'
import { useIdentityState } from '@/lib/identity-guard'
import { notify } from '@/lib/notify'
import { MOBILE_BREAKPOINT, useMediaQuery } from '@skriuw/shared/client'
import { Drawer, DrawerContent, Switch } from '@skriuw/ui'
import { IconButton } from '@skriuw/ui/icons'
import { FileText, Calendar, Clock, Hash, HardDrive, Share2, Eye, X } from 'lucide-react'
import { useState, useMemo, useCallback } from 'react'

const DEFAULT_EXPANDED_SECTIONS = new Set<SectionKey>([SECTION_KEYS.TOC, SECTION_KEYS.METADATA])

export function RightSidebar({ noteId, content = [] }: RightSidebarProps) {
	const { isRightSidebarOpen, toggleRightSidebar, setRightSidebarOpen } = useUIStore()
	const { items, setNoteVisibility } = useNotesContext()
	const isMobile = useMediaQuery(MOBILE_BREAKPOINT)

	const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
		() => new Set(DEFAULT_EXPANDED_SECTIONS)
	)
	const [isToggling, setIsToggling] = useState(false)

	const currentNote = useMemo((): Note | null => {
		if (!noteId) return null
		const found = items.find((item) => item.id === noteId && item.type === 'note')
		return (found as Note) ?? null
	}, [noteId, items])

	const tableOfContents = useTableOfContents(content)
	const metadata = useNoteMetadata(currentNote, content)
	const shareUrl = useShareUrl(currentNote?.publicId)
	const scrollToHeading = useScrollToHeading()
	const { isAuthenticated } = useIdentityState()

	const toggleSection = useCallback((section: string) => {
		setExpandedSections((prev) => {
			const next = new Set(prev)
			if (next.has(section as SectionKey)) {
				next.delete(section as SectionKey)
			} else {
				next.add(section as SectionKey)
			}
			return next
		})
	}, [])

	const handleToggleVisibility = useCallback(
		async (nextState: boolean) => {
			if (!currentNote) return
			setIsToggling(true)
			try {
				await setNoteVisibility(currentNote.id, nextState)
				notify(nextState ? 'Note is now public' : 'Note is now private')
			} catch (error) {
				console.error('Failed to toggle visibility', error)
				notify(error instanceof Error ? error.message : 'Failed to toggle visibility')
			} finally {
				setIsToggling(false)
			}
		},
		[currentNote, setNoteVisibility]
	)

	if (!isRightSidebarOpen) return null

	if (isMobile) {
		return (
			<Drawer
				open={isRightSidebarOpen}
				onOpenChange={setRightSidebarOpen}
				shouldScaleBackground
			>
				<DrawerContent
					id='note-details-panel'
					className='z-50 max-h-[85svh] rounded-t-2xl border-border bg-background'
				>
					<SidebarBody
						tableOfContents={tableOfContents}
						metadata={metadata}
						shareUrl={shareUrl}
						scrollToHeading={scrollToHeading}
						expandedSections={expandedSections}
						toggleSection={toggleSection}
						currentNote={currentNote}
						isAuthenticated={isAuthenticated}
						isToggling={isToggling}
						handleToggleVisibility={handleToggleVisibility}
						onClose={toggleRightSidebar}
						headerClass='px-4 pb-3 pt-[max(env(safe-area-inset-top),1rem)]'
						contentClass='overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),1rem)]'
					/>
				</DrawerContent>
			</Drawer>
		)
	}

	return (
		<div
			id='note-details-panel'
			className='fixed right-0 top-12 md:top-10 z-40 flex h-full w-80 flex-col border-l border-border bg-background shadow-lg'
		>
			<SidebarBody
				tableOfContents={tableOfContents}
				metadata={metadata}
				shareUrl={shareUrl}
				scrollToHeading={scrollToHeading}
				expandedSections={expandedSections}
				toggleSection={toggleSection}
				currentNote={currentNote}
				isAuthenticated={isAuthenticated}
				isToggling={isToggling}
				handleToggleVisibility={handleToggleVisibility}
				onClose={toggleRightSidebar}
				headerClass='p-4'
				contentClass='flex-1 overflow-y-auto p-4'
			/>
		</div>
	)
}

type SidebarBodyProps = {
	tableOfContents: ReturnType<typeof useTableOfContents>
	metadata: ReturnType<typeof useNoteMetadata>
	shareUrl: string
	scrollToHeading: ReturnType<typeof useScrollToHeading>
	expandedSections: Set<SectionKey>
	toggleSection: (section: string) => void
	currentNote: Note | null
	isAuthenticated: boolean
	isToggling: boolean
	handleToggleVisibility: (nextState: boolean) => Promise<void>
	onClose: () => void
	headerClass: string
	contentClass: string
}

function SidebarBody({
	tableOfContents,
	metadata,
	shareUrl,
	scrollToHeading,
	expandedSections,
	toggleSection,
	currentNote,
	isAuthenticated,
	isToggling,
	handleToggleVisibility,
	onClose,
	headerClass,
	contentClass
}: SidebarBodyProps) {
	return (
		<>
			<div
				className={`flex items-center justify-between border-b border-border ${headerClass}`}
			>
				<h2 className='text-lg font-semibold'>Note Details</h2>
				<IconButton
					icon={<X className='w-4 h-4' />}
					tooltip='Close sidebar'
					variant='toolbar'
					onClick={onClose}
					aria-label='Close note details'
					className='touch-manipulation'
				/>
			</div>

			<div className={`${contentClass} space-y-4`}>
				<CollapsibleSection
					id={SECTION_KEYS.TOC}
					title='Table of Contents'
					icon={<FileText className='w-4 h-4' />}
					isExpanded={expandedSections.has(SECTION_KEYS.TOC)}
					onToggle={toggleSection}
				>
					{tableOfContents.length > 0 ? (
						<div className='space-y-1'>
							{tableOfContents.map((item) => (
								<TOCItem key={item.id} item={item} onNavigate={scrollToHeading} />
							))}
						</div>
					) : (
						<p className='text-sm text-muted-foreground'>No headings found</p>
					)}
				</CollapsibleSection>

				<CollapsibleSection
					id={SECTION_KEYS.METADATA}
					title='Metadata'
					icon={<Hash className='w-4 h-4' />}
					isExpanded={expandedSections.has(SECTION_KEYS.METADATA)}
					onToggle={toggleSection}
				>
					{metadata ? (
						<div className='space-y-3'>
							<MetadataRow
								icon={Calendar}
								label='Created'
								value={metadata.createdAt}
							/>
							<MetadataRow icon={Clock} label='Updated' value={metadata.updatedAt} />
							<MetadataRow icon={FileText} label='Words' value={metadata.wordCount} />
							<MetadataRow icon={HardDrive} label='Size' value={metadata.size} />
						</div>
					) : (
						<p className='text-sm text-muted-foreground'>No note selected</p>
					)}
				</CollapsibleSection>

				{isAuthenticated ? (
					<div className='rounded-lg border border-border'>
						<div className='flex items-center justify-between p-3'>
							<div className='flex items-center gap-2'>
								<Share2 className='w-4 h-4' />
								<span className='font-medium'>Public Share</span>
							</div>
							<Switch
								checked={currentNote?.isPublic ?? false}
								onCheckedChange={handleToggleVisibility}
								disabled={isToggling || !currentNote}
								aria-label='Toggle public visibility'
							/>
						</div>
						{currentNote?.isPublic ? (
							<div className='space-y-2 px-3 pb-3'>
								<div className='flex items-center gap-2 text-sm'>
									<Eye className='w-4 h-4 text-muted-foreground' />
									<span className='text-muted-foreground'>Unique visitors:</span>
									<span>{currentNote.publicViews ?? 0}</span>
								</div>
								{shareUrl ? (
									<div
										className='break-all rounded-md bg-muted p-2 text-xs'
										aria-label='Share URL'
									>
										{shareUrl}
									</div>
								) : (
									<p className='px-1 text-sm text-muted-foreground'>
										Enable cloud storage to generate a public link.
									</p>
								)}
							</div>
						) : (
							<p className='px-3 pb-3 text-sm text-muted-foreground'>
								Keep notes private by default. Enable sharing to generate a public
								link.
							</p>
						)}
					</div>
				) : null}
			</div>
		</>
	)
}

type MetadataRowProps = {
	icon: React.ComponentType<{ className?: string }>
	label: string
	value: string | number
}

function MetadataRow({ icon: Icon, label, value }: MetadataRowProps) {
	return (
		<div className='flex items-center gap-2 text-sm'>
			<Icon className='w-4 h-4 text-muted-foreground' />
			<span className='text-muted-foreground'>{label}:</span>
			<span>{value}</span>
		</div>
	)
}
