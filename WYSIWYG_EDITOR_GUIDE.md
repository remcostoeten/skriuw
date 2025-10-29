# WYSIWYG Markdown Editor Guide

## Overview

Both apps (InstantDB and Turso) now use **Tiptap**, a modern WYSIWYG editor that automatically converts markdown syntax as you type. No more split view - just one area where you type and see formatted results instantly!

## Technology

- **Editor**: Tiptap v3.9.1
- **Extensions**: StarterKit, Typography, Placeholder
- **Storage**: HTML format (Tiptap's native format)

## Markdown Shortcuts

### Headings
Type these at the start of a line followed by a space:

- `#` + space → Heading 1
- `##` + space → Heading 2
- `###` + space → Heading 3

### Text Formatting
Type these around text:

- `**text**` → **bold**
- `*text*` → *italic*
- `~~text~~` → ~~strikethrough~~
- `` `code` `` → `inline code`

### Lists
Type these at the start of a line:

- `-` + space → Bullet list
- `*` + space → Bullet list
- `1.` + space → Numbered list
- `[ ]` + space → Checkbox (todo item)
- `[x]` + space → Checked checkbox

### Other Elements

- `>` + space → Blockquote
- ` ``` ` + Enter → Code block
- `---` + Enter → Horizontal rule

### Links
- Type a URL and it will auto-convert to a clickable link
- Or use markdown syntax: `[text](url)`

## Features

✅ **Auto-conversion**: Markdown syntax converts as you type
✅ **Real-time formatting**: See the final result while editing
✅ **Storage-friendly**: Saves as HTML (no conversion needed)
✅ **Keyboard shortcuts**: Standard editor shortcuts work (Cmd+B for bold, etc.)
✅ **Undo/Redo**: Full history support
✅ **Offline support**: Works with both InstantDB and Turso storage

## Implementation Details

### File Locations

**InstantDB App:**
- Component: `apps/instantdb/components/note-editor.tsx`
- Styles: `apps/instantdb/app/globals.css`

**Turso App:**
- Component: `apps/turso/src/components/note-editor.tsx`
- Styles: `apps/turso/src/index.css`

### Dependencies

```json
{
  "@tiptap/react": "^3.9.1",
  "@tiptap/starter-kit": "^3.9.1",
  "@tiptap/extension-placeholder": "^3.9.1",
  "@tiptap/extension-typography": "^3.9.1"
}
```

## Customization

To add more markdown shortcuts or features, you can extend the editor with additional Tiptap extensions:

- **@tiptap/extension-task-list**: Enhanced todo lists
- **@tiptap/extension-table**: Tables support
- **@tiptap/extension-image**: Image support
- **@tiptap/extension-link**: Enhanced links
- **@tiptap/extension-highlight**: Text highlighting

See [Tiptap documentation](https://tiptap.dev/docs/editor/extensions/nodes) for more extensions.

## Benefits Over Previous Implementation

1. **Better UX**: Single editing area (no context switching between input and preview)
2. **Faster**: No React re-renders for preview updates
3. **More intuitive**: Like Notion, Obsidian, or any modern note-taking app
4. **Industry standard**: Tiptap is used by many production apps
5. **Extensible**: Easy to add more features via extensions
6. **Better storage**: HTML is easier to work with than raw markdown

