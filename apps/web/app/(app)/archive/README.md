# Archive Page Skeleton Loaders

This directory contains specific skeleton loaders for the archive page components, providing better loading states than generic skeletons.

## Available Skeletons

### Page-Level Skeletons

- **`ArchivePageSkeleton`** - Full page skeleton including header, tabs, and content area
- **`ExportPanelSkeleton`** - Skeleton for the export panel with stats and format options
- **`ImportPanelSkeleton`** - Skeleton for the import panel with drag & drop area
- **`TrashPanelSkeleton`** - Skeleton for the trash panel with item list

### State-Specific Skeletons (Import)

- **`ImportPreviewSkeleton`** - Skeleton for import preview state
- **`ImportingSkeleton`** - Skeleton for active import state
- **`ImportCompleteSkeleton`** - Skeleton for import completion state

### State-Specific Skeletons (Trash)

- **`EmptyTrashSkeleton`** - Skeleton for empty trash state
- **`TrashLoadingSkeleton`** - Skeleton for initial loading state

## Usage Examples

### Basic Page Loading

```tsx
import { ArchivePageSkeleton } from '@/app/archive/components'

export default function ArchivePage() {
	const [isLoading, setIsLoading] = useState(true)

	if (isLoading) {
		return <ArchivePageSkeleton />
	}

	return <ActualArchivePage />
}
```

### Tab-Specific Loading

```tsx
import {
	ExportPanelSkeleton,
	ImportPanelSkeleton,
	TrashPanelSkeleton,
} from '@/app/archive/components'

export function ArchiveContent({ activeTab, isTabLoading }) {
	if (isTabLoading) {
		switch (activeTab) {
			case 'export':
				return <ExportPanelSkeleton />
			case 'import':
				return <ImportPanelSkeleton />
			case 'trash':
				return <TrashPanelSkeleton />
			default:
				return null
		}
	}

	return <ActualContent />
}
```

### Import State Management

```tsx
import {
	ImportPanelSkeleton,
	ImportPreviewSkeleton,
	ImportingSkeleton,
	ImportCompleteSkeleton,
} from '@/app/archive/components'

export function ImportPanel() {
	const [step, setStep] = useState('select')

	switch (step) {
		case 'loading':
			return <ImportPanelSkeleton />
		case 'preview':
			return <ImportPreviewSkeleton />
		case 'importing':
			return <ImportingSkeleton />
		case 'complete':
			return <ImportCompleteSkeleton />
		default:
			return <ActualImportPanel />
	}
}
```

## Features

### Realistic Layout Matching

- Each skeleton matches the exact layout of its corresponding component
- Proper spacing, sizing, and element positioning
- Includes icons, buttons, and interactive elements

### Smooth Transitions

- Designed to work with Framer Motion animations
- Maintains layout stability during loading states
- Prevents content jumping

### Accessibility

- Uses semantic HTML structure
- Maintains focus management
- Screen reader friendly

## Customization

### Modifying Skeletons

Each skeleton can be customized by editing the individual component files:

```tsx
// Example: Modify ExportPanelSkeleton
export function ExportPanelSkeleton() {
	return (
		<div className="space-y-6">
			{/* Custom stats layout */}
			<div className="grid grid-cols-3 gap-4">
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-16 w-full" />
			</div>

			{/* Custom format options */}
			<div className="space-y-2">
				{Array.from({ length: 3 }).map((_, i) => (
					<Skeleton key={i} className="h-20 w-full" />
				))}
			</div>
		</div>
	)
}
```

### Adding Loading Delays

For demonstration purposes, you can add artificial delays:

```tsx
const [isLoading, setIsLoading] = useState(true)

useEffect(() => {
	const timer = setTimeout(() => {
		setIsLoading(false)
	}, 2000) // 2 second delay

	return () => clearTimeout(timer)
}, [])
```

## Best Practices

1. **Use Specific Skeletons**: Always use the most specific skeleton available for better UX
2. **Match Real Content**: Ensure skeleton dimensions match actual content to prevent layout shifts
3. **Minimal Loading Time**: Keep loading states as short as possible while maintaining realism
4. **Smooth Transitions**: Use Framer Motion for smooth transitions between skeletons and content
5. **Error States**: Consider adding error state skeletons alongside loading states

## Integration with Existing Components

These skeletons are designed to work seamlessly with the existing archive page components:

- `ExportPanel` → `ExportPanelSkeleton`
- `ImportPanel` → `ImportPanelSkeleton` (and state-specific variants)
- `TrashPanel` → `TrashPanelSkeleton`

Simply replace the component with its skeleton counterpart during loading states.
