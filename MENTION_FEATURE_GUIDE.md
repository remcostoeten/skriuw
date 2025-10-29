# @ Mention Feature - Note Linking Guide

## Overview

Both apps now support **@ mentions** to create hyperlinks between notes. Type `@` followed by a note name to create a clickable link that navigates directly to the referenced note.

## How to Use

### Creating a Link

1. In any note, type `@`
2. A dropdown will appear showing all other notes
3. Type to filter the list (searches note titles)
4. Press `Enter` or click to select a note
5. A clickable link is created: `@Note Title`

### Navigating via Links

- Click any `@mention` link in the editor
- The app automatically switches to the referenced note
- Works in both InstantDB and Turso apps

## Features

✅ **Smart Search**: Filter notes by typing after `@`
✅ **Keyboard Navigation**: Use arrow keys and Enter to select
✅ **Visual Feedback**: Mentions are highlighted with accent colors
✅ **Bidirectional**: Link from any note to any other note
✅ **Real-time Updates**: New notes appear in the suggestion list immediately
✅ **Clickable**: Just click to navigate (no CMD/CTRL needed)

## Technical Implementation

### New Dependencies

```json
{
  "@tiptap/extension-mention": "^3.9.1",
  "@tiptap/suggestion": "^3.9.1",
  "tippy.js": "^6.3.7"
}
```

### Architecture

**InstantDB:**
- `components/mention-list.tsx` - Dropdown suggestion component
- `lib/mention-suggestion.tsx` - Suggestion configuration
- Updated `components/note-editor.tsx` - Editor with mention support
- Updated `views/notes-view.tsx` - Navigation handling

**Turso:**
- `src/components/mention-list.tsx` - Dropdown suggestion component
- `src/lib/mention-suggestion.tsx` - Suggestion configuration
- Updated `src/components/note-editor.tsx` - Editor with mention support
- Updated `src/views/notes-view.tsx` - Navigation handling

### Storage Format

Mentions are stored as HTML with custom attributes:

```html
<a class="mention" data-mention-id="note-uuid" href="#">@Note Title</a>
```

This allows:
- Proper rendering of the mention
- Click handling to navigate
- Persistence of the link relationship

## Keyboard Shortcuts

When the mention dropdown is open:

- `↑` - Move selection up
- `↓` - Move selection down
- `Enter` - Select current item
- `Escape` - Close dropdown
- Type to filter results

## Styling

Mentions have distinct styling to make them stand out:

- **Background**: Accent color
- **Padding**: Small padding for visibility
- **Hover**: Slightly darker on hover
- **Cursor**: Pointer to indicate clickability

## Use Cases

### 1. Project Organization
```
## Main Project

Related notes:
- See @Requirements for details
- Check @Timeline for milestones
- Review @Meeting Notes from last week
```

### 2. Knowledge Base
```
## JavaScript Basics

For advanced topics, see:
- @Async Programming
- @Error Handling Best Practices
- @Performance Optimization
```

### 3. Task Dependencies
```
## Current Sprint

Blocked by:
- @API Integration needs completion
- Waiting on @Design Review
```

### 4. Research Notes
```
## Literature Review

Related papers:
- @Smith et al 2023 discusses similar findings
- Contradicts @Johnson 2022
- Builds on @Previous Study
```

## Limitations

1. **Self-references**: You cannot mention the current note (filtered out)
2. **Deleted notes**: If a referenced note is deleted, the link becomes inactive
3. **Renamed notes**: The link shows the original title (HTML stores the label)

## Future Enhancements

Potential improvements:

- **Backlinks**: Show which notes link to the current note
- **Graph view**: Visualize note relationships
- **Rename propagation**: Update link labels when notes are renamed
- **Dead link detection**: Highlight links to deleted notes
- **Link preview**: Hover to see note preview
- **Tag support**: Use `#` for tags in addition to `@` for notes

## Troubleshooting

### Dropdown not appearing
- Make sure you typed `@` at the start of a word
- Check that other notes exist in your workspace
- Verify Tippy.js CSS is loaded

### Links not clickable
- Ensure JavaScript is enabled
- Check browser console for errors
- Verify the `mention` class is styled

### Navigation not working
- Check that `onNoteSelect` callback is passed to `NoteEditor`
- Verify the referenced note still exists
- Look for console errors

## Examples in Action

### Before
```
Check the requirements document
Review meeting notes from yesterday
```

### After
```
Check @Requirements Document
Review @Meeting Notes - 2025-10-28
```

Now clicking those mentions instantly navigates to those notes!

## Developer Notes

### Adding Custom Mention Types

You can extend the system to support other entity types (e.g., tasks, users):

```typescript
// Create a new mention type for tasks
Mention.extend({
  name: 'taskMention',
  // Custom configuration
})
```

### Custom Styling

Modify the `.mention` class in CSS:

```css
.mention {
  /* Your custom styles */
  background: linear-gradient(to right, #667eea 0%, #764ba2 100%);
  border-radius: 1rem;
}
```

### Event Handling

Add custom logic on mention click:

```typescript
handleClick(_view, _pos, event) {
  const target = event.target as HTMLElement;
  if (target.classList.contains('mention')) {
    const mentionId = target.getAttribute('data-mention-id');
    // Your custom logic here
  }
}
```

## Resources

- [Tiptap Mention Extension](https://tiptap.dev/docs/editor/extensions/nodes/mention)
- [Tippy.js Documentation](https://atomiks.github.io/tippyjs/)
- [Tiptap Suggestion Plugin](https://tiptap.dev/docs/editor/extensions/functionality/suggestion)

## Summary

The @ mention feature transforms your notes from isolated documents into an interconnected knowledge graph. Link related concepts, reference dependencies, and navigate your workspace with ease!

