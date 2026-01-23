import type { Item, Note } from '../types'
import { flattenNotes } from './flatten-notes'
import { extractWikilinksFromBlocks } from './wikilink-parser'

export type Backlink = {
    noteId: string
    noteName: string
    context: string
    linkText: string
}

export function getBacklinks(items: Item[], currentNoteId: string, currentNoteName: string): Backlink[] {
    const backlinks: Backlink[] = []
    const allNotes = flattenNotes(items).filter((item): item is Note => item.type === 'note')
    const lowerNoteName = currentNoteName.toLowerCase()

    for (const note of allNotes) {
        if (note.id === currentNoteId) continue
        if (!note.content || !Array.isArray(note.content)) continue

        const wikilinkMatches = extractWikilinksFromBlocks(note.content)

        for (const match of wikilinkMatches) {
            if (match.noteName.toLowerCase() === lowerNoteName) {
                const context = extractContextAroundWikilink(note.content, match.noteName)
                backlinks.push({
                    noteId: note.id,
                    noteName: note.name,
                    context,
                    linkText: match.fullMatch
                })
            }
        }
    }

    return backlinks
}

export function getUnlinkedMentions(items: Item[], currentNoteId: string, currentNoteName: string): Backlink[] {
    const unlinkedMentions: Backlink[] = []
    const allNotes = flattenNotes(items).filter((item): item is Note => item.type === 'note')
    const lowerNoteName = currentNoteName.toLowerCase()

    for (const note of allNotes) {
        if (note.id === currentNoteId) continue
        if (!note.content || !Array.isArray(note.content)) continue

        const textContent = extractTextFromBlocks(note.content)
        const wikilinkMatches = extractWikilinksFromBlocks(note.content)
        const linkedNames = wikilinkMatches.map(m => m.noteName.toLowerCase())

        if (linkedNames.includes(lowerNoteName)) continue

        const mentionRegex = new RegExp(`\\b${escapeRegex(currentNoteName)}\\b`, 'gi')
        if (mentionRegex.test(textContent)) {
            const context = extractContextAroundMention(textContent, currentNoteName)
            unlinkedMentions.push({
                noteId: note.id,
                noteName: note.name,
                context,
                linkText: currentNoteName
            })
        }
    }

    return unlinkedMentions
}

function extractTextFromBlocks(blocks: any[]): string {
    const textParts: string[] = []

    function traverse(blockList: any[]) {
        for (const block of blockList) {
            if (block.content && Array.isArray(block.content)) {
                for (const inline of block.content) {
                    if (inline.type === 'text' && inline.text) {
                        textParts.push(inline.text)
                    }
                }
            }
            if (block.children && Array.isArray(block.children)) {
                traverse(block.children)
            }
        }
    }

    traverse(blocks)
    return textParts.join(' ')
}

function extractContextAroundWikilink(blocks: any[], noteName: string): string {
    const fullText = extractTextFromBlocks(blocks)
    const wikilinkPattern = `[[${noteName}]]`
    const index = fullText.toLowerCase().indexOf(wikilinkPattern.toLowerCase())

    if (index === -1) return ''

    const start = Math.max(0, index - 50)
    const end = Math.min(fullText.length, index + wikilinkPattern.length + 50)
    let context = fullText.slice(start, end)

    if (start > 0) context = '...' + context
    if (end < fullText.length) context = context + '...'

    return context.trim()
}

function extractContextAroundMention(text: string, mention: string): string {
    const lowerText = text.toLowerCase()
    const lowerMention = mention.toLowerCase()
    const index = lowerText.indexOf(lowerMention)

    if (index === -1) return ''

    const start = Math.max(0, index - 50)
    const end = Math.min(text.length, index + mention.length + 50)
    let context = text.slice(start, end)

    if (start > 0) context = '...' + context
    if (end < text.length) context = context + '...'

    return context.trim()
}

function escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
