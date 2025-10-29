# Quick Start Guide - New Features

## 🚀 WYSIWYG Editor + @ Mentions

Your notes app just got a major upgrade! Here's how to use the new features.

---

## 1️⃣ WYSIWYG Editor

### Before vs After

**❌ Old Way:**
```
┌─────────────────────┐
│ Textarea            │
│ ## My Heading       │ ← Type here
│ This is **bold**    │
└─────────────────────┘

┌─────────────────────┐
│ Preview             │
│ My Heading          │ ← See here
│ This is bold        │
└─────────────────────┘
```

**✅ New Way:**
```
┌─────────────────────┐
│ ## → My Heading     │ ← Type and see instantly!
│ This is bold        │    Converts as you type
└─────────────────────┘
```

### Try It Now!

1. **Create a heading:**
   ```
   Type: ##
   Press: Space
   Result: Heading 2!
   ```

2. **Make text bold:**
   ```
   Type: **bold text**
   Result: bold text (formatted instantly)
   ```

3. **Create a list:**
   ```
   Type: -
   Press: Space
   Result: • List item
   ```

### All Shortcuts

| Type | Press Space | Result |
|------|------------|---------|
| `##` | ␣ | Heading 2 |
| `###` | ␣ | Heading 3 |
| `**text**` | - | **bold** |
| `*text*` | - | *italic* |
| `-` | ␣ | • Bullet |
| `1.` | ␣ | 1. Number |
| `>` | ␣ | > Quote |
| `` `code` `` | - | `code` |

---

## 2️⃣ @ Mention Linking

### The Problem

Before: "Check the requirements document" (which one? where?)

After: "Check @Requirements Document" (click to navigate!)

### How It Works

```
┌─────────────────────────────────┐
│ Type @                          │
│                                 │
│ ┌─────────────────────────┐    │
│ │ Search notes...         │    │
│ ├─────────────────────────┤    │
│ │ > Requirements Document │    │
│ │   Meeting Notes         │    │
│ │   API Integration       │    │
│ │   Design Mockups        │    │
│ └─────────────────────────┘    │
│                                 │
│ Select and it becomes:          │
│ Check @Requirements Document ←  │
│                        (click!)  │
└─────────────────────────────────┘
```

### Step-by-Step

1. **Type @**
   - Dropdown appears with all notes

2. **Type to filter**
   ```
   @req → Shows "Requirements Document"
   @api → Shows "API Integration"
   ```

3. **Select note**
   - Press `Enter` OR
   - Click with mouse

4. **Click to navigate**
   - Click the `@mention` link
   - Instantly jump to that note!

### Use Cases

**Project Management:**
```
## Current Sprint

Tasks:
- Complete @Requirements Document
- Review @Design Mockups  
- Implement @API Integration

Blocked by @Backend Team Discussion
```

**Knowledge Base:**
```
## JavaScript Basics

For more info:
- See @Functions Guide
- Check @Async Programming
- Review @Best Practices
```

**Meeting Notes:**
```
## Team Meeting - Oct 29

Decisions:
- Use approach from @Architecture Proposal
- Timeline in @Project Schedule
- Budget from @Q4 Planning
```

---

## 🎯 Quick Tips

### Tip 1: Combine Features
```markdown
## @Project Name Updates

Recent changes:
- **Completed**: @Requirements Phase
- *In Progress*: @Implementation
- **Blocked**: @Design Review

> See @Timeline for deadlines
```

### Tip 2: Create Hub Notes
```markdown
## Main Project Hub

Documentation:
- @Requirements
- @Architecture  
- @API Docs

Planning:
- @Timeline
- @Budget
- @Resources
```

### Tip 3: Use Search in Mentions
```
Type: @des
Shows: - @Design Mockups
       - @Design System
       - @Desktop App
```

---

## ⌨️ Keyboard Shortcuts

### Editor Shortcuts
- `Cmd/Ctrl + B` → Bold
- `Cmd/Ctrl + I` → Italic
- `Cmd/Ctrl + Z` → Undo
- `Cmd/Ctrl + Shift + Z` → Redo

### Mention Shortcuts  
- `@` → Open selector
- `↑` → Previous note
- `↓` → Next note
- `Enter` → Select note
- `Escape` → Close selector

---

## 🎨 Visual Guide

### Formatted Content Looks Like

```
╔═══════════════════════════════════╗
║                                   ║
║  My Amazing Note                  ║  ← Big heading
║                                   ║
║  Introduction                     ║  ← Medium heading
║  This is regular text with bold   ║
║  and italic formatting.           ║
║                                   ║
║  • First item                     ║  ← Bullet list
║  • Second item                    ║
║                                   ║
║  Check @Related Note for more     ║  ← Clickable link
║                                   ║
║  > Important quote here           ║  ← Blockquote
║                                   ║
║  Use console.log() for debug      ║  ← Inline code
║                                   ║
╚═══════════════════════════════════╝
```

### Mentions Look Like

```
Regular text @Mention Link regular text
              ╰──────────╯
              Highlighted with
              accent color,
              clickable!
```

---

## ✅ Checklist: Try Everything!

- [ ] Create a heading with `##`
- [ ] Make text bold with `**text**`
- [ ] Create a bullet list with `-`
- [ ] Add inline code with `` `code` ``
- [ ] Type `@` and see the dropdown
- [ ] Create a link to another note
- [ ] Click a mention to navigate
- [ ] Use arrow keys in the mention dropdown

---

## 🚦 Getting Started in 30 Seconds

1. **Start the app:**
   ```bash
   cd apps/instantdb
   pnpm dev
   ```

2. **Create 2-3 notes** with different names

3. **In one note, type:**
   ```
   ## My Project

   See @[other note name]
   ```

4. **Click the mention** → Navigate! 🎉

---

## 🆘 Troubleshooting

### "Markdown not converting"
→ Make sure you press `Space` after shortcuts like `##`

### "Dropdown not appearing"
→ Make sure you have multiple notes created

### "Can't find my note"
→ Type to filter: `@requ` finds "Requirements"

### "Link not working"
→ Make sure you selected a note (it should be highlighted)

---

## 📚 Learn More

For detailed documentation:

- **WYSIWYG_EDITOR_GUIDE.md** - All editor features
- **MENTION_FEATURE_GUIDE.md** - All mention features
- **TIPTAP_USAGE_EXAMPLES.md** - More examples
- **RELEASE_NOTES.md** - Complete overview

---

## 🎉 You're Ready!

Start typing `##` and experience the magic! ✨

Then type `@` and connect your notes! 🔗

**Happy note-taking! 📝**

