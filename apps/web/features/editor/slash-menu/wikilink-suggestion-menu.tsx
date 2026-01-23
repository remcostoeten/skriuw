import { useNoteMentionCandidates } from "../hooks/use-note-mentions";
import { searchNoteMentions, type HighlightPart, type NoteMentionSearchResult } from "../utils/note-mention-search";
import { SuggestionMenuController, type SuggestionMenuProps, useBlockNoteEditor } from "@blocknote/react";
import { Link2 } from "lucide-react";
import { useCallback } from "react";

// NoteMentionSearchResult is sufficient for now, but we alias it in case we need extra props later
type MentionSuggestionItem = NoteMentionSearchResult
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
            // BlockNote captures the char after the trigger.
            // If trigger is '[', user types '[' (to make [[), query might handle it.
            // We want to trigger on '[[', but BN supports single char.
            // We'll use '[' as trigger, but we need to check if we are actually doing a double bracket.
            // BUT, standard BN doesn't easily support multi-char trigger logic in the *trigger* prop.
            // However, we can just trigger on '[' and show menu.
            // If the user continues typing, we filter.

            // TODO: Add "Create new note" item if no match
            const results = searchNoteMentions(query, candidates)
            return results
        },
        [candidates]
    )

    const handleItemClick = useCallback(
        (item: MentionSuggestionItem) => {
            if (!editor) return

            // Insert the WikiLink inline content
            editor.insertInlineContent([
                {
                    type: "wikilink",
                    props: {
                        noteName: item.title,
                        noteId: item.id
                    }
                },
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
