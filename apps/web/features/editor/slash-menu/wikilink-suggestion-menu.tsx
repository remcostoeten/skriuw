import { useNoteMentionCandidates } from "../hooks/use-note-mentions";
import { searchNoteMentions, type HighlightPart, type NoteMentionSearchResult } from "../utils/note-mention-search";
import { SuggestionMenuController, type SuggestionMenuProps, useBlockNoteEditor } from "@blocknote/react";
import { Link2 } from "lucide-react";
import { useCallback } from "react";

// NoteMentionSearchResult is sufficient for now, but we alias it in case we need extra props later
// NoteMentionSearchResult is sufficient for now, but we alias it in case we need extra props later
type MentionSuggestionItem = NoteMentionSearchResult & {
    isCreateOption?: boolean
}
type MentionGetItems = (query: string) => Promise<MentionSuggestionItem[]>

const WikilinkMenuList = ({
    items,
    selectedIndex,
    onItemClick
}: SuggestionMenuProps<MentionSuggestionItem>) => {
    const activeOptionId =
        selectedIndex !== undefined && selectedIndex >= 0
            ? `wikilink-mention-${items[selectedIndex]?.id}`
            : undefined

    if (!items.length) {
        return (
            <div
                className='skriuw-mention-menu empty'
                role='listbox'
                aria-label='Wikilink suggestions'
            >
                <span className='skriuw-mention-menu__empty'>No existing notes found</span>
                {/* Future: Add "Create note" option here */}
            </div>
        )
    }

    return (
        <div
            className='skriuw-mention-menu'
            role='listbox'
            aria-label='Wikilink suggestions'
            aria-activedescendant={activeOptionId}
        >
            {items.map((item: MentionSuggestionItem, index: number) => {
                const optionId = `wikilink-mention-${item.id}`
                return (
                    <button
                        key={item.id}
                        id={optionId}
                        type='button'
                        role='option'
                        aria-selected={selectedIndex === index}
                        className={`skriuw-mention-menu__item ${selectedIndex === index ? 'is-selected' : ''}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onItemClick?.(item)}
                    >
                        <span className='skriuw-mention-menu__icon' aria-hidden='true'>
                            <Link2 size={14} />
                        </span>
                        <span className='skriuw-mention-menu__content'>
                            <span className='skriuw-mention-menu__title'>
                                {renderHighlightedText(item.titleHighlights)}
                            </span>
                            {item.path && (
                                <span className='skriuw-mention-menu__path'>{item.path}</span>
                            )}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

function renderHighlightedText(parts: HighlightPart[]) {
    if (!parts.length) return null

    return parts.map((part, index) =>
        part.matched ? (
            <mark key={`${part.text}-${index}`}>{part.text}</mark>
        ) : (
            <span key={`${part.text}-${index}`}>{part.text}</span>
        )
    )
}

export function WikilinkSuggestionMenu() {
    const editor = useBlockNoteEditor()
    const candidates = useNoteMentionCandidates()

    const getItems = useCallback<MentionGetItems>(
        async (query) => {
            const results = searchNoteMentions(query, candidates)

            // If no exact match, add "Create Note" option
            // We consider it a "no exact match" if the query is not empty and no result has the exact same title
            // Or simply always add it at the bottom if the query is non-empty?
            // A common pattern is: Show matches. If query doesn't match any Title exactly, show "Create 'Query'".

            const hasExactMatch = results.some(r => r.title.toLowerCase() === query.toLowerCase())

            if (query.trim().length > 0 && !hasExactMatch) {
                const createOption: MentionSuggestionItem = {
                    id: `create-${query}`,
                    title: `Create "${query}"`,
                    titleHighlights: [{ text: `Create "${query}"`, matched: true }],
                    path: 'New Note',
                    updatedAt: Date.now(),
                    isCreateOption: true,
                    score: 1
                }
                return [...results, createOption]
            }

            return results
        },
        [candidates]
    )

    const handleItemClick = useCallback(
        (item: MentionSuggestionItem) => {
            if (!editor) return

            if (item.isCreateOption) {
                // For create option, we insert the link with the query as the name and empty ID
                // The WikiLink component handles the creation when clicked
                const noteName = item.title.replace(/^Create "/, '').replace(/"$/, '')
                editor.insertInlineContent([
                    {
                        type: "wikilink",
                        props: {
                            noteName: noteName,
                            noteId: "" // Empty ID signals it needs creation
                        }
                    } as any,
                    " "
                ])
                return
            }

            // Insert the WikiLink inline content
            editor.insertInlineContent([
                {
                    type: "wikilink",
                    props: {
                        noteName: item.title,
                        noteId: item.id
                    }
                } as any,
                " " // trailing space
            ])
        },
        [editor]
    )

    if (!editor) return null

    return (
        <SuggestionMenuController<MentionGetItems>
            triggerCharacter='['
            minQueryLength={0}
            getItems={getItems}
            onItemClick={handleItemClick}
            suggestionMenuComponent={WikilinkMenuList}
        />
    )
}
