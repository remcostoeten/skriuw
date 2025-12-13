# Smart Save & Revision System Plan

## Objective
Implement a system to intelligently save note iterations and allow reverting to previous points. The system should avoid saving on every keystroke or simple debounce, focusing instead on "meaningful" changes (ignoring whitespace, etc.).

## 1. Database Schema
We need a place to store the history. We will add a `note_revisions` table to `packages/db/db/schema.ts`.

```typescript
export const noteRevisions = pgTable('note_revisions', {
    id: text('id').primaryKey(),
    noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
    content: text('content').notNull(), // JSON stringified content
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    reason: text('reason'), // e.g., 'smart_save', 'manual_snapshot'
}, (table) => ({
    noteIdIdx: index('note_revisions_note_id_idx').on(table.noteId),
    createdAtIdx: index('note_revisions_created_at_idx').on(table.createdAt),
}));
```

## 2. Core Logic (`packages/core-logic`)
We need a pure function to determine if a revision should be created.

**File:** `packages/core-logic/src/smart-save.ts`

```typescript
import { Block } from '@blocknote/core';

export function shouldCreateRevision(
    oldContent: Block[], 
    newContent: Block[]
): boolean {
    // 1. Structural Check
    if (oldContent.length !== newContent.length) return true;

    // 2. Content Check (Normalized)
    const oldText = normalizeContent(oldContent);
    const newText = normalizeContent(newContent);

    return oldText !== newText;
}

function normalizeContent(blocks: Block[]): string {
    return blocks.map(block => {
        // Extract text from block content array
        const text = Array.isArray(block.content) 
            ? block.content.map(c => c.type === 'text' ? c.text : '').join('')
            : '';
            
        // Recursively handle children
        const childrenText = block.children ? normalizeContent(block.children) : '';
        
        return (text + childrenText).replace(/\s+/g, ''); // Strip whitespace
    }).join('');
}
```

## 3. Integration (`apps/web`)

### A. Backend / API
We need a mutation to create a revision.
- `createRevision(noteId, content)`

### B. Frontend Hook (`useEditor`)
Update `apps/web/features/editor/hooks/use-editor.ts`:

1.  **Track Last Revision**: Keep a `ref` of the content from the last *revision* save (not just the last *db* save).
2.  **Smart Check**: Inside the `handleSave` (or a separate effect):
    ```typescript
    const lastRevisionRef = useRef(initialContent);

    const handleSmartSave = async (currentContent) => {
        // Always update the "current" state in DB (for persistence)
        await updateNote(noteId, currentContent);

        // Check if we should create a history point
        if (shouldCreateRevision(lastRevisionRef.current, currentContent)) {
            await createRevision(noteId, currentContent);
            lastRevisionRef.current = currentContent;
        }
    }
    ```

## 4. UI for Reversion
- Add a "History" button to the editor toolbar.
- Opens a modal/sidebar with a list of revisions (timestamps).
- Clicking a revision shows a preview (read-only editor).
- "Restore" button replaces current editor content with revision content.
