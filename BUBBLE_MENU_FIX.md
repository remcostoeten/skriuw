# BubbleMenu Fix

## Issue

The error "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object" was caused by trying to use `BubbleMenu` from `@tiptap/extension-bubble-menu` as a React component.

## Root Cause

In Tiptap v3.10.1, `BubbleMenu` from `@tiptap/extension-bubble-menu` is an Extension object (for the editor configuration), not a React component. When we tried to use it as JSX `<BubbleMenu>`, React received an object instead of a component.

## Solution

**Temporary**: Removed the BubbleMenu UI for now to fix the error. The editor will work without the floating toolbar.

## To Re-add BubbleMenu (Future)

### Option 1: Use Floating Menu Extension (Recommended)

Tiptap v3 uses a different approach. Install and use the floating menu:

```bash
bun add @tiptap/extension-floating-menu
```

Then create a custom component:

```tsx
import { FloatingMenu } from '@tiptap/extension-floating-menu'

// In extensions array:
extensions: [
  FloatingMenu,
  // ... other extensions
]

// In JSX:
{editor && (
  <div className="floating-menu">
    {editor.isActive('paragraph') && (
      <div className="menu-bar">
        <button onClick={() => editor.chain().focus().toggleBold().run()}>
          Bold
        </button>
        {/* other buttons */}
      </div>
    )}
  </div>
)}
```

### Option 2: Create Custom Selection Toolbar

Use a fixed toolbar or selection-based popup:

```tsx
function EditorToolbar({ editor }: { editor: Editor }) {
  if (!editor) return null

  return (
    <div className="toolbar">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'active' : ''}
      >
        <Bold />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'active' : ''}
      >
        <Italic />
      </button>
      {/* More buttons... */}
    </div>
  )
}

// Use it:
{editor && (
  <>
    <EditorToolbar editor={editor} />
    <EditorContent editor={editor} />
  </>
)}
```

### Option 3: Check for React Component Export

Some Tiptap packages may export React components differently in v3. Check if there's a React-specific export:

```tsx
// Try these imports:
import { BubbleMenu } from '@tiptap/extension-bubble-menu/react'
// or
import BubbleMenu from '@tiptap/extension-bubble-menu/BubbleMenu'
```

## Current Status

✅ Editor works without errors
❌ No floating/bubble menu (feature removed temporarily)

## Editor Features Still Working

- Bold, Italic, Strikethrough, Code (via keyboard shortcuts)
- Headings (via markdown syntax: ##)
- Lists (via markdown syntax: -)
- @mentions for note linking
- Placeholder text
- All keyboard shortcuts (Cmd/Ctrl + B, I, etc.)

Users can still format text using keyboard shortcuts:

- `Ctrl/Cmd + B` - Bold
- `Ctrl/Cmd + I` - Italic
- `Ctrl/Cmd + K` - Code
- Type `##` at start of line - Heading 2
- Type `-` at start of line - Bullet list

## Files Modified

- `src/components/editor/note-editor.tsx` - Removed BubbleMenu import and usage
