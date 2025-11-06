# 🌱 Database Seeding

> All seeding utilities are organized in `src/_seeding/` module.

## Quick Reference

### 🚀 Fastest Method (Browser Console)

```javascript
fetch('/api/seed/shortcuts-note',{method:'POST'}).then(r=>r.json()).then(console.log)
```

### 📦 Import in Code

```typescript
import { seedKeyboardShortcutsNote } from '@/_seeding';

await seedKeyboardShortcutsNote({ pinned: false, position: 0 });
```

### 🖱️ React Component

```tsx
import { SeedShortcutsNoteButton } from '@/_seeding';

<SeedShortcutsNoteButton />
```

### 🔧 Backend Script

```bash
npx tsx src/_seeding/shortcuts-note/script.ts
```

---

## 📚 Full Documentation

See [`src/_seeding/README.md`](./src/_seeding/README.md) for complete documentation, troubleshooting, and advanced usage.

## 📁 Module Structure

```
src/_seeding/
├── README.md              # Complete documentation
├── index.ts               # Public exports
└── shortcuts-note/
    ├── content.ts         # Note content
    ├── seed.ts            # Core seeding logic
    ├── seed-button.tsx    # React component
    ├── route.ts           # API route handler
    └── script.ts          # Backend CLI script
```

## ✨ Available Seeds

- **Keyboard Shortcuts Note** - Documentation about the app's keyboard shortcuts

---

**Note:** The `_` prefix indicates this is a development-only module.

