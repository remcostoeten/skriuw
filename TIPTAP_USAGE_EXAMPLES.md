# Tiptap Editor - Usage Examples

## Basic Usage

The editor is now live in both apps. Just start typing and use markdown shortcuts!

## Live Examples

### Creating a Heading

**Type:**
```
## My Heading
```

**Converts to:**
# My Heading
(formatted instantly as you type the space after ##)

---

### Creating a List

**Type:**
```
- First item
- Second item
- Third item
```

**Result:**
- First item
- Second item  
- Third item

---

### Bold and Italic

**Type:**
```
This is **bold** and this is *italic*
```

**Result:**
This is **bold** and this is *italic*

---

### Code

**Type:**
```
Use `console.log()` for debugging
```

**Result:**
Use `console.log()` for debugging

---

### Blockquote

**Type:**
```
> This is a quote
> from someone famous
```

**Result:**
> This is a quote
> from someone famous

---

### Mixed Formatting

**Type:**
```
## Project Tasks

Here's what we need to do:

- **Design** the new homepage
- Write *documentation* for the API
- Add `error handling` to the backend
- Test everything!

> Remember: Quality over quantity

Done!
```

**Result:**
All of the above formatted beautifully with proper spacing, colors, and typography!

## Advanced Features

### Keyboard Shortcuts

The editor supports standard keyboard shortcuts:

- `Cmd/Ctrl + B` - Bold
- `Cmd/Ctrl + I` - Italic
- `Cmd/Ctrl + Z` - Undo
- `Cmd/Ctrl + Shift + Z` - Redo
- `Enter` - New line
- `Shift + Enter` - Soft break

### Smart Typography

The Typography extension automatically converts:

- `"quotes"` → "smart quotes"
- `--` → en-dash (–)
- `---` → em-dash (—)
- `(c)` → ©
- `(r)` → ®
- `(tm)` → ™
- `...` → …
- `!=` → ≠
- `->` → →
- `<-` → ←

### Auto-linking

Just type a URL and it becomes clickable:
```
https://example.com
```

## Customizing the Editor

### Changing Placeholder Text

In `note-editor.tsx`:

```typescript
Placeholder.configure({
  placeholder: 'Your custom placeholder here...',
}),
```

### Limiting Heading Levels

```typescript
StarterKit.configure({
  heading: {
    levels: [1, 2], // Only allow H1 and H2
  },
}),
```

### Disabling Features

```typescript
StarterKit.configure({
  heading: false,    // Disable headings
  bold: false,       // Disable bold
  italic: false,     // Disable italic
}),
```

## Storage Format

The editor stores content as HTML:

```html
<h2>My Heading</h2>
<p>This is <strong>bold</strong> and <em>italic</em>.</p>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

This is automatically handled by Tiptap and works seamlessly with both InstantDB and Turso storage.

## Migrating Existing Content

If you have existing markdown content, it will still work! Tiptap can handle plain text and will render it as paragraphs. Users can then format it using the shortcuts.

To batch convert existing markdown to HTML, you could:

1. Load the content into the editor
2. Let Tiptap parse it
3. Save it back (automatically as HTML)

Or use a markdown-to-HTML converter like `marked` for bulk migration.

## Troubleshooting

### Editor not showing
- Check browser console for errors
- Ensure Tiptap dependencies are installed
- Verify the `.tiptap` CSS class is defined in your CSS file

### Content not saving
- Check that the `onUpdate` callback is working
- Verify your storage layer is connected
- Look for network errors in browser DevTools

### Markdown not converting
- Ensure you type the shortcut at the start of a line (for headings, lists, etc.)
- Type the space after the markdown syntax
- Check that the StarterKit extension is configured

## Resources

- **Tiptap Docs**: https://tiptap.dev/docs/editor/introduction
- **Extensions**: https://tiptap.dev/docs/editor/extensions
- **API Reference**: https://tiptap.dev/docs/editor/api/editor
- **Community**: https://github.com/ueberdosis/tiptap/discussions

## Need Help?

Check the following files:
- `WYSIWYG_EDITOR_GUIDE.md` - Complete feature guide
- `EDITOR_MIGRATION_SUMMARY.md` - What changed and why
- Source code in `note-editor.tsx` - Implementation details

