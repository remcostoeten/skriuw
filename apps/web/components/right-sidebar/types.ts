import type { Block } from "@blocknote/core";

/**
 * Section identifiers for the collapsible panels
 */
export const SECTION_KEYS = {
	TOC: 'toc',
	METADATA: 'metadata'
} as const

export type SectionKey = (typeof SECTION_KEYS)[keyof typeof SECTION_KEYS]

/**
 * Table of Contents item structure
 */
export type TOCItem = {
	id: string
	title: string
	level: number
	children: TOCItem[]
}

/**
 * Computed metadata for a note
 */
export type NoteMetadata = {
	createdAt: string
	updatedAt: string
	wordCount: number
	size: string
}

/**
 * Props for the main RightSidebar component
 */
export type RightSidebarProps = {
	noteId?: string
	content?: Block[]
}
