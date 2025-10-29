import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
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
      <div className="bg-popover border border-border rounded-lg shadow-lg p-2 text-sm text-muted-foreground">
        No notes found
      </div>
    );
  }

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
      {props.items.map((item, index) => (
        <button
          key={item.id}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
            index === selectedIndex ? 'bg-accent' : ''
          }`}
          onClick={() => selectItem(index)}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';

export default MentionList;

