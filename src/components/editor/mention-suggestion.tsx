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
          arrow: false,
          theme: 'menu',
          maxWidth: 'none',
          offset: [0, 6],
          zIndex: 9999,
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

export type TaskMentionItem = { id: string; label: string };

export const createTaskMentionSuggestion = (
  availableTasks: TaskMentionItem[]
): Omit<SuggestionOptions<TaskMentionItem>, 'editor'> => ({
  items: ({ query }): TaskMentionItem[] => {
    const q = (query || '').toLowerCase();
    const isFuzzyMatch = (text: string, pattern: string): number => {
      if (!pattern) return 0; // best score
      let ti = 0;
      let score = 0;
      const tl = text.length;
      for (let pi = 0; pi < pattern.length; pi++) {
        const ch = pattern[pi];
        let found = false;
        while (ti < tl) {
          if (text[ti].toLowerCase() === ch) {
            // reward contiguous matches
            score += 1 + (ti > 0 && text[ti - 1].toLowerCase() === (pattern[pi - 1] || '') ? 1 : 0);
            ti++;
            found = true;
            break;
          }
          ti++;
        }
        if (!found) return -1;
      }
      // shorter overall is slightly better
      return score - Math.max(0, tl - pattern.length) * 0.01;
    };

    const ranked = availableTasks
      .map((t) => ({ t, s: isFuzzyMatch(t.label, q) }))
      .filter(({ s }) => s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map(({ t }) => t);

    return ranked;
  },

  render: () => {
    let component: ReactRenderer<MentionListRef, SuggestionProps<any>>;
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
          arrow: false,
          theme: 'menu',
          maxWidth: 'none',
          offset: [0, 6],
          zIndex: 9999,
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

