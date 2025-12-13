# Command Palette Implementation Plan

## Overview

Create a VS Code-style command palette with fuzzy search, keyboard navigation, and comprehensive action coverage using a centralized actions module.

## Architecture

### 1. Centralized Actions Module

**Location**: `apps/web/features/actions/`

#### Core Files:

```
apps/web/features/actions/
├── types.ts                 # Action types and interfaces
├── registry.ts              # Action registration and discovery
├── categories.ts            # Action categorization
├── core-actions.ts          # Core application actions
├── editor-actions.ts        # Editor-specific actions
├── split-actions.ts         # Split view actions
├── navigation-actions.ts     # Navigation actions
├── settings-actions.ts      # Settings actions
└── index.ts               # Public exports
```

#### Action Interface:

```typescript
interface Action {
	id: string
	title: string
	description?: string
	category: ActionCategory
	icon?: React.ComponentType
	keywords?: string[] // Additional search terms
	shortcut?: string[] // Keyboard shortcut
	enabled?: () => boolean // Dynamic enable/disable
	handler: () => void | Promise<void>
	when?: string // Context condition (e.g., "noteOpen", "splitView")
}

enum ActionCategory {
	FILE = 'file',
	EDIT = 'edit',
	VIEW = 'view',
	SPLIT = 'split',
	NAVIGATION = 'navigation',
	SETTINGS = 'settings'
}
```

### 2. Command Palette Component

**Location**: `apps/web/features/command-palette/`

#### Core Files:

```
apps/web/features/command-palette/
├── components/
│   ├── command-palette.tsx      # Main palette component
│   ├── command-input.tsx        # Fuzzy search input
│   ├── command-list.tsx          # Results list
│   └── command-item.tsx         # Individual result item
├── hooks/
│   ├── use-command-palette.ts    # Palette state management
│   └── use-fuzzy-search.ts      # Fuzzy search logic
├── providers/
│   └── command-palette-provider.tsx # Global state provider
└── index.ts
```

#### Features:

- **Fuzzy Search**: Fuse.js or custom implementation
- **Keyboard Navigation**: Arrow keys, Enter, Escape
- **Mouse Support**: Click to execute
- **Categorized Results**: Grouped by category
- **Recent Commands**: Track frequently used
- **Context Awareness**: Show relevant actions based on current state

### 3. Integration Points

#### Shortcut Integration:

```typescript
// apps/web/features/shortcuts/shortcut-definitions.ts
'command-palette': {
  keys: [['Ctrl', 'p'], ['Shift', 'Shift']],
  description: 'Open command palette',
  enabled: true,
}
```

#### Layout Manager Integration:

```typescript
// apps/web/components/layout/app-layout-manager.tsx
useShortcut('command-palette', (e) => {
	e.preventDefault()
	openCommandPalette()
})
```

## Action Categories

### File Operations

- **Create Note**: New note in current folder
- **Create Folder**: New folder in current location
- **Delete Item**: Delete selected file/folder
- **Rename Item**: Rename selected file/folder
- **Duplicate Note**: Duplicate current note
- **Move to Archive**: Archive selected item

### Editor Operations

- **Favorite Note**: Toggle favorite status
- **Pin Note**: Toggle pin status
- **Toggle Editor Mode**: Switch between raw/visual
- **Focus Editor**: Focus active editor
- **Insert Block**: Open slash menu

### Split View Operations

- **Toggle Split**: Single ↔ split view
- **Split Horizontal**: Force horizontal split
- **Split Vertical**: Force vertical split
- **Close Left Pane**: Close left pane
- **Close Right Pane**: Close right pane
- **Close All Panes**: Close all except active
- **Next Pane**: Cycle to next pane
- **Swap Panes**: Swap pane positions
- **Close Vertical Split**: Only if vertically split
- **Close Horizontal Split**: Only if horizontally split

### Navigation Operations

- **Search in File Tree**: Focus sidebar search
- **Collapse All Folders**: Collapse file tree
- **Expand All Folders**: Expand file tree
- **Go to Note**: Quick note navigation
- **Open Archive**: Open archive page
- **Open Trash**: Open trash page

### Settings Operations

- **Open Settings**: Open settings panel
- **Open Editor Settings**: Jump to editor tab
- **Open Theme Settings**: Jump to theme tab
- **Open Shortcut Settings**: Jump to shortcuts tab
- **Toggle Theme**: Switch light/dark
- **Reset Settings**: Reset to defaults

## Implementation Details

### 1. Action Registry

```typescript
// apps/web/features/actions/registry.ts
class ActionRegistry {
	private actions = new Map<string, Action>()

	register(action: Action): void {
		this.actions.set(action.id, action)
	}

	getActions(context?: ActionContext): Action[] {
		return Array.from(this.actions.values()).filter((action) =>
			this.isActionEnabled(action, context)
		)
	}

	search(query: string, context?: ActionContext): Action[] {
		const actions = this.getActions(context)
		return fuzzySearch(actions, query, {
			keys: ['title', 'description', 'keywords'],
			threshold: 0.3
		})
	}
}
```

### 2. Command Palette State

```typescript
// apps/web/features/command-palette/hooks/use-command-palette.ts
interface CommandPaletteState {
	isOpen: boolean
	query: string
	selectedIndex: number
	results: Action[]
	recentActions: Action[]
}

export const useCommandPalette = () => {
	const [state, setState] = useState<CommandPaletteState>({
		isOpen: false,
		query: '',
		selectedIndex: 0,
		results: [],
		recentActions: []
	})

	const openPalette = () => setState((prev) => ({ ...prev, isOpen: true }))
	const closePalette = () =>
		setState((prev) => ({ ...prev, isOpen: false, query: '' }))
	const executeAction = (action: Action) => {
		action.handler()
		closePalette()
		addToRecent(action)
	}

	return { ...state, openPalette, closePalette, executeAction }
}
```

### 3. Keyboard Navigation

```typescript
// apps/web/features/command-palette/components/command-palette.tsx
const handleKeyDown = (e: KeyboardEvent) => {
	switch (e.key) {
		case 'ArrowDown':
			e.preventDefault()
			setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
			break
		case 'ArrowUp':
			e.preventDefault()
			setSelectedIndex((prev) => Math.max(prev - 1, 0))
			break
		case 'Enter':
			e.preventDefault()
			if (results[selectedIndex]) {
				executeAction(results[selectedIndex])
			}
			break
		case 'Escape':
			e.preventDefault()
			closePalette()
			break
	}
}
```

### 4. Context-Aware Actions

```typescript
// apps/web/features/actions/types.ts
interface ActionContext {
	hasActiveNote: boolean
	isSplitView: boolean
	splitOrientation: 'vertical' | 'horizontal' | 'single'
	selectedItems: string[]
	currentFolder: string
	isMobile: boolean
}

// Example: Conditional action registration
const closeLeftPaneAction: Action = {
	id: 'split.close-left',
	title: 'Close Left Pane',
	category: ActionCategory.SPLIT,
	when: 'splitView && orientation === "vertical"',
	handler: () => splitViewStore.closeLeftPane()
}
```

## UI/UX Design

### Visual Design:

- **Modal Overlay**: Semi-transparent backdrop
- **Centered Dialog**: Fixed width, max height with scroll
- **Search Input**: Large, prominent at top
- **Results List**: Categorized sections
- **Keyboard Shortcuts**: Displayed in results
- **Icons**: Visual category indicators

### Interaction Flow:

1. **Ctrl+P** → Opens palette
2. **Type Query** → Fuzzy search filters results
3. **Arrow Keys** → Navigate results
4. **Enter** → Execute selected action
5. **Escape** → Close palette
6. **Click** → Execute any result

### Performance Optimizations:

- **Virtual Scrolling**: For large result sets
- **Debounced Search**: 300ms delay
- **Memoized Results**: Cache search results
- **Lazy Loading**: Load actions on demand

## Migration Strategy

### Phase 1: Core Infrastructure

1. Create actions module and registry
2. Implement basic command palette component
3. Add Ctrl+P shortcut integration

### Phase 2: Action Implementation

1. Implement core file operations
2. Add editor actions
3. Implement split view actions

### Phase 3: Advanced Features

1. Add context awareness
2. Implement recent commands
3. Add fuzzy search optimization

### Phase 4: Integration & Polish

1. Integrate with existing shortcuts
2. Add settings for customization
3. Performance optimization

## Benefits

### User Experience:

- **Discoverable**: All actions in one place
- **Fast**: Keyboard-first navigation
- **Contextual**: Relevant actions only
- **Consistent**: Same pattern as VS Code

### Developer Experience:

- **DRY**: Centralized action definitions
- **Extensible**: Easy to add new actions
- **Maintainable**: Single source of truth
- **Testable**: Isolated action logic

### Technical Benefits:

- **Performance**: Lazy loading, caching
- **Accessibility**: Full keyboard support
- **Internationalization**: Ready for i18n
- **Type Safety**: Full TypeScript coverage

## File Structure Summary

```
apps/web/features/
├── actions/                    # Centralized action system
│   ├── types.ts
│   ├── registry.ts
│   ├── categories.ts
│   ├── core-actions.ts
│   ├── editor-actions.ts
│   ├── split-actions.ts
│   ├── navigation-actions.ts
│   ├── settings-actions.ts
│   └── index.ts
├── command-palette/           # Command palette UI
│   ├── components/
│   ├── hooks/
│   ├── providers/
│   └── index.ts
└── shortcuts/                  # Updated with new integration
    ├── shortcut-definitions.ts
    └── use-shortcut.ts
```

This implementation provides a comprehensive, extensible command palette that follows VS Code patterns while integrating seamlessly with the existing codebase architecture.
