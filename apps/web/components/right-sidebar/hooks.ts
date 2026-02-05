import type { TOCItem, NoteMetadata } from "./types";
import type { Note } from "@/features/notes/types";
import { blocksToText } from "@/features/notes/utils/blocks-to-text";
import type { Block } from "@blocknote/core";
import { useMemo, useCallback } from "react";

/**
 * Build a hierarchical table of contents from BlockNote heading blocks
 */
export function useTableOfContents(content: Block[]): TOCItem[] {
	return useMemo(() => {
		if (!content || content.length === 0) return []

		const toc: TOCItem[] = []
		const stack: TOCItem[] = []

		for (const block of content) {
			if (block.type === 'heading' && block.props?.level) {
				const title = blocksToText([block]).trim()
				if (!title) continue

				const item: TOCItem = {
					id: block.id,
					title,
					level: block.props.level as number,
					children: []
				}

				// Pop items from stack until we find a parent with lower level
				while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
					stack.pop()
				}

				if (stack.length === 0) {
					toc.push(item)
				} else {
					stack[stack.length - 1].children.push(item)
				}

				stack.push(item)
			}
		}

		return toc
	}, [content])
}

/**
 * Calculate computed metadata for the current note
 */
export function useNoteMetadata(note: Note | null, content: Block[]): NoteMetadata | null {
	return useMemo(() => {
		if (!note) return null

		const text = blocksToText(content)
		const wordCount = text.split(/\s+/).filter((word) => word.length > 0).length

		// Use TextEncoder for accurate UTF-8 byte length (more efficient than Blob)
		const sizeBytes = new TextEncoder().encode(text).length
		const size = sizeBytes < 1024 ? `${sizeBytes} B` : `${(sizeBytes / 1024).toFixed(1)} KB`

		return {
			createdAt: note.createdAt ? new Date(note.createdAt).toLocaleDateString() : 'Unknown',
			updatedAt: note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : 'Unknown',
			wordCount,
			size
		}
	}, [note, content])
}

/**
 * Generate the public share URL for a note
 */
export function useShareUrl(publicId: string | null | undefined): string {
	return useMemo(() => {
		if (!publicId || typeof window === 'undefined') return ''
		return `${window.location.origin}/public/${publicId}`
	}, [publicId])
}

/**
 * Scroll to a heading element in the editor
 */
export function useScrollToHeading() {
	return useCallback((headingId: string) => {
		// Sanitize the headingId to prevent selector injection
		const sanitizedId = CSS.escape(headingId)
		const element = document.querySelector(
			`[data-content-type="heading"][data-id="${sanitizedId}"]`
		)
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'center' })
		}
	}, [])
}
