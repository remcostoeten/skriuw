import {
  SuggestionMenuController,
  type SuggestionMenuProps,
  useBlockNoteEditor
} from '@blocknote/react'
import { Link2 } from 'lucide-react'
import { useCallback } from 'react'

import { useNoteMentionCandidates } from '../hooks/use-note-mentions'
import {
  searchNoteMentions,
  type HighlightPart,
  type NoteMentionSearchResult
} from '../utils/note-mention-search'

type MentionSuggestionItem = NoteMentionSearchResult & {
  url: string
}
type MentionGetItems = (query: string) => Promise<MentionSuggestionItem[]>

const MentionMenuList = ({
  items,
  selectedIndex,
  onItemClick
}: SuggestionMenuProps<MentionSuggestionItem>) => {
  const activeOptionId =
    selectedIndex !== undefined && selectedIndex >= 0
      ? `note-mention-${items[selectedIndex]?.id}`
      : undefined

  if (!items.length) {
    return (
      <div className="skriuw-mention-menu empty" role="listbox" aria-label="Mention suggestions">
        <span className="skriuw-mention-menu__empty">No notes found</span>
      </div>
    )
  }

  return (
    <div
      className="skriuw-mention-menu"
      role="listbox"
      aria-label="Mention suggestions"
      aria-activedescendant={activeOptionId}
    >
      {items.map((item, index) => {
        const optionId = `note-mention-${item.id}`
        return (
          <button
            key={item.id}
            id={optionId}
            type="button"
            role="option"
            aria-selected={selectedIndex === index}
            className={`skriuw-mention-menu__item ${selectedIndex === index ? 'is-selected' : ''}`}
            onMouseDown={event => event.preventDefault()}
            onClick={() => onItemClick?.(item)}
          >
            <span className="skriuw-mention-menu__icon" aria-hidden="true">
              <Link2 size={14} />
            </span>
            <span className="skriuw-mention-menu__content">
              <span className="skriuw-mention-menu__title">
                {renderHighlightedText(item.titleHighlights)}
              </span>
              {item.path && <span className="skriuw-mention-menu__path">{item.path}</span>}
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

export function NoteMentionSuggestionMenu() {
  const editor = useBlockNoteEditor()
  const candidates = useNoteMentionCandidates()

  const getItems = useCallback<MentionGetItems>(
    async query => {
      const results = searchNoteMentions(query, candidates)
      return results.map(result => ({
        ...result,
        url: `/note/${result.id}`
      }))
    },
    [candidates]
  )

  const handleItemClick = useCallback(
    (item: MentionSuggestionItem) => {
      if (!editor) return
      editor.createLink(item.url, item.title)
      editor.insertInlineContent(' ')
    },
    [editor]
  )

  return (
    <SuggestionMenuController<MentionGetItems>
      triggerCharacter="@"
      minQueryLength={0}
      getItems={getItems}
      onItemClick={handleItemClick}
      suggestionMenuComponent={MentionMenuList}
    />
  )
}
