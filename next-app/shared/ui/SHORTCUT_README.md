# Keyboard Shortcut System

A strongly-typed, feature-rich keyboard shortcut system with excellent DX (Developer Experience).

## Features

- ✅ **Strongly Typed**: Full TypeScript support with autocomplete
- ✅ **Platform Aware**: Automatically converts `Cmd`/`⌘` to `Ctrl` on Windows/Linux
- ✅ **Multiple Display Formats**: Text, icon, or mixed
- ✅ **Sequence Support**: Up to 3 keys in sequence (chord shortcuts)
- ✅ **Optional Delays**: Configure max delays between sequences

## Quick Start

### Basic Usage

```tsx
import { shortcut } from '@/features/shortcuts';
import { Kbd } from '@/shared/ui/kbd';

// Create a shortcut
const myShortcut = shortcut().modifiers('Ctrl', 'Shift').key('N');

// Display it
<Kbd shortcut={myShortcut} />
```

### Simple Shortcuts

```tsx
// Single modifier + key
const saveShortcut = shortcut().modifiers('Ctrl').key('S');

// Multiple modifiers
const createShortcut = shortcut().modifiers('Ctrl', 'Shift').key('N');

// Platform-aware (Cmd on Mac, Ctrl on Windows/Linux)
const openShortcut = shortcut().modifiers('Cmd').key('O');

// No modifiers
const focusShortcut = shortcut().key('/');
```

### Sequence Shortcuts (Chords)

```tsx
// Two-key sequence: Ctrl+K then Ctrl+S
const saveAsShortcut = shortcut()
  .combo('Ctrl', 'K')
  .then('Ctrl', 'S')
  .build();

// Three-key sequence with delays
const complexShortcut = shortcut()
  .combo('Ctrl', 'K')
  .then('Ctrl', 'S', { maxDelay: 1000 })
  .then('Ctrl', 'D')
  .build();
```

### Display Formats

```tsx
// Text format (default)
const textShortcut = shortcut().modifiers('Ctrl').key('N');

// Icon format
const iconShortcut: KeyboardShortcut = {
  sequences: [[{ modifiers: ['Cmd'], key: 'N' }]],
  displayFormat: 'icon',
};

// Mixed format
const mixedShortcut: KeyboardShortcut = {
  sequences: [[{ modifiers: ['Ctrl', 'Shift'], key: 'N' }]],
  displayFormat: 'mixed',
};

// Use in component
<Kbd shortcut={iconShortcut} format="icon" />
```

### Helper Functions

```tsx
import { createShortcut, createSequence } from '@/features/shortcuts';

// Simple shortcut
const save = createShortcut('Ctrl', 'S');
const saveWithMultipleMods = createShortcut(['Ctrl', 'Shift'], 'N');

// Sequence shortcut
const search = createSequence(
  { modifiers: ['Ctrl'], key: 'K' },
  { modifiers: ['Ctrl'], key: 'S' }
);
```

## API Reference

### `shortcut()`

Creates a new shortcut builder.

**Methods:**
- `.modifiers(...modifiers: Modifier[])` - Set modifiers
- `.key(key: RegularKey)` - Set the key and build shortcut
- `.combo(modifiers, key)` - Start a sequence shortcut

**Example:**
```tsx
shortcut().modifiers('Ctrl', 'Shift').key('N')
```

### `createShortcut(modifiers, key)`

Helper function for simple shortcuts.

**Parameters:**
- `modifiers`: `Modifier | Modifier[]` - Single or multiple modifiers
- `key`: `RegularKey` - The key to press

**Example:**
```tsx
createShortcut('Ctrl', 'S')
createShortcut(['Ctrl', 'Shift'], 'N')
```

### `createSequence(...combos)`

Helper function for sequence shortcuts.

**Parameters:**
- `...combos`: `KeyCombo[]` - Up to 3 key combinations

**Example:**
```tsx
createSequence(
  { modifiers: ['Ctrl'], key: 'K' },
  { modifiers: ['Ctrl'], key: 'S' }
)
```

### `<Kbd />` Component

Displays a keyboard shortcut.

**Props:**
- `shortcut`: `KeyboardShortcut` - The shortcut to display
- `separator`: `boolean` - Show `+` between keys (default: `false`)
- `format`: `'text' | 'icon' | 'mixed'` - Display format (default: `'text'`)
- `className`: `string` - Additional CSS classes

**Example:**
```tsx
<Kbd shortcut={myShortcut} separator format="icon" />
```

## Types

### Modifiers

```tsx
type Modifier = 'Ctrl' | 'Cmd' | 'Alt' | 'Shift' | 'Meta';
```

### Regular Keys

```tsx
type RegularKey =
  | 'A' | 'B' | 'C' | ... | 'Z'
  | '0' | '1' | ... | '9'
  | 'Enter' | 'Space' | 'Tab' | 'Escape' | 'Backspace' | 'Delete'
  | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
  | 'Home' | 'End' | 'PageUp' | 'PageDown'
  | 'F1' | 'F2' | ... | 'F12'
  | '/' | '[' | ']' | '\\' | ';' | "'" | ',' | '.' | '=' | '-'
  | string; // Custom keys allowed
```

### KeyboardShortcut

```tsx
type KeyboardShortcut = {
  sequences: ShortcutSequence[];
  displayFormat?: DisplayFormat;
  description?: string;
};
```

## Platform Awareness

The system automatically handles platform differences:

- **macOS**: `Cmd`/`⌘` displays as `⌘`
- **Windows/Linux**: `Cmd`/`⌘` displays as `Ctrl`

This happens automatically - you don't need to do anything special!

## Examples

### In EmptyState Component

```tsx
<EmptyState
  actions={[
    {
      label: "Create Note",
      shortcut: shortcut().modifiers("Cmd").key("N"),
      onClick: handleCreateNote,
    },
  ]}
/>
```

### Complex Sequence

```tsx
const advancedShortcut = shortcut()
  .combo('Ctrl', 'K')
  .then('Ctrl', 'S', { maxDelay: 1000 })
  .then('Ctrl', 'D')
  .build();

<Kbd shortcut={advancedShortcut} />
```

## Best Practices

1. **Use typed shortcuts** for new code - better autocomplete and type safety
2. **Use `Cmd` for platform-aware shortcuts** - it will automatically convert
3. **Use descriptive variable names** - `createNoteShortcut` is better than `shortcut1`
4. **Keep shortcuts consistent** - use the same modifiers for similar actions
5. **Document complex sequences** - add comments for multi-key shortcuts

