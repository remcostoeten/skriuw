import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import MentionList, { type MentionListRef, type MentionItem } from '@/components/mention-list';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';

export const createMentionSuggestion = (
  availableNotes: MentionItem[]
): Omit<SuggestionOptions<MentionItem>, 'editor'> => ({
  items: ({ query }): MentionItem[] => {
    return availableNotes
      .filter((note) => 
        note.title.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 5);
  },

  render: () => {
    let component: ReactRenderer<MentionListRef, SuggestionProps<MentionItem>>;
    let popup: TippyInstance[];

    return {
      onStart: (props) => {
        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        });
      },

      onUpdate(props) {
        component.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect as () => DOMRect,
        });
      },

      onKeyDown(props) {
        if (props.event.key === 'Escape') {
          popup[0].hide();
          return true;
        }

        return component.ref?.onKeyDown(props) ?? false;
      },

      onExit() {
        popup[0].destroy();
        component.destroy();
      },
    };
  },
});

