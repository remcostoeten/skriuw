'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useState } from 'react';
import type { SuggestionProps } from '@tiptap/suggestion';

export interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export interface MentionItem {
  id: string;
  title: string;
}

const MentionList = forwardRef<MentionListRef, SuggestionProps<MentionItem>>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listboxId = useId();

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        upHandler();
        return true;
      }

      if (event.key === 'ArrowDown') {
        downHandler();
        return true;
      }

      if (event.key === 'Enter') {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div
        className="bg-popover border border-border rounded-lg shadow-lg p-2 text-sm text-muted-foreground"
        role="listbox"
        aria-label="No suggestions"
      >
        No notes found
      </div>
    );
  }

  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Suggestions"
      aria-activedescendant={`${listboxId}-option-${selectedIndex}`}
      className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-72 min-w-[200px] backdrop-blur-sm"
    >
      <div className="overflow-auto max-h-72 scrollbar-thin">
        {props.items.map((item, index) => (
          <button
            key={item.id}
            id={`${listboxId}-option-${index}`}
            role="option"
            aria-selected={index === selectedIndex}
            tabIndex={-1}
            className={`w-full text-left px-4 py-2.5 text-sm transition-colors focus:outline-none focus:bg-accent ${
              index === selectedIndex 
                ? 'bg-accent text-accent-foreground' 
                : 'text-foreground hover:bg-accent/50'
            }`}
            onMouseEnter={() => setSelectedIndex(index)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectItem(index)}
          >
            <span className="block truncate">{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

MentionList.displayName = 'MentionList';

export default MentionList;

