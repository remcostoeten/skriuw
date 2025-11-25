# Non-Blocking Loading Architecture

## Overview

This document describes the zero-layout-shift, non-blocking loading architecture implemented across the application.

## Core Principles

1. **Zero Layout Shifts**: Layout structure is defined immediately, never changes
2. **Non-Blocking Loading**: Each data source loads independently without blocking others
3. **Separation of Concerns**: Layout components are pure, data loading is isolated
4. **Progressive Enhancement**: UI renders instantly with skeleton, data hydrates progressively

## Architecture Layers

### 1. Skeleton Components (`/shared/ui`, `/components/*/skeleton.tsx`)

Pure presentational components that mimic the exact structure of loaded content:

- `Skeleton` - Base skeleton primitive
- `SidebarSkeleton` - Mimics file tree structure
- `StorageStatusSkeleton` - Mimics storage panel structure
- `IndexSkeleton` - Mimics empty state structure

**Key Features:**
- Match exact dimensions of real content
- Use realistic item counts (configurable)
- Support nested structures where applicable

### 2. Layout Components (`/components/layout/*-shell.tsx`)

Pure layout components with no data dependencies:

- `AppLayoutShell` - Defines grid structure, positioning, and transitions
- `SidebarLayout` - Defines sidebar structure only

**Characteristics:**
- Accept ReactNode slots for content
- No API calls or hooks
- No conditional rendering based on data state
- Pure CSS/structure only

### 3. Container Components (`/components/layout/*-container.tsx`)

Data-aware components that orchestrate loading and state:

- `AppLayoutContainer` - Manages app-wide data and state
- Wraps layout shells with data logic
- Implements Suspense boundaries
- Uses lazy loading for heavy components

**Responsibilities:**
- Data fetching via custom hooks
- State management (UI state, not data state)
- Keyboard shortcuts
- Routing/navigation

### 4. Data Hooks (`/features/*/hooks/use*.ts`)

Custom hooks that provide non-blocking data loading:

- `useNotesWithSuspense` - Notes data with loading states
- `useStorageData` - Storage data with independent key loading

**Features:**
- `isInitialLoading` state for skeleton display
- `isRefreshing` state for non-blocking updates
- `useDeferredValue` for concurrent updates
- `startTransition` for non-blocking mutations
- Independent loading per data source

## Loading Flow

### Initial Page Load

```
1. Route mounts → Container component renders
2. Container immediately renders Shell with Skeletons
3. Data hooks trigger (non-blocking)
4. Each data source loads independently
5. Loaded data replaces skeleton (no layout shift)
```

### Subsequent Updates

```
1. User action (create/update/delete)
2. Mutation executes immediately
3. startTransition wraps state update
4. UI remains responsive during refresh
5. New data streams in without blocking
```

## Example: Storage Status Panel

**Before (Blocking):**
```tsx
// All keys load sequentially, blocks UI
const keys = await getStorageKeys()
for (const key of keys) {
  const items = await read(key) // Blocks
  data.push({ key, items })
}
setStorageData(data) // Single render at end
```

**After (Non-Blocking):**
```tsx
// Structure renders immediately
setStorageData(keys.map(key => ({ key, items: [] })))

// Each key loads independently
keys.forEach(async (key, index) => {
  const items = await read(key) // Parallel
  startTransition(() => {
    setStorageData(prev => {
      const newData = [...prev]
      newData[index] = { ...newData[index], items }
      return newData
    })
  })
})
```

## Suspense Boundaries

Strategic placement prevents cascading failures:

```tsx
<Suspense fallback={<SidebarSkeleton />}>
  {isInitialLoading ? (
    <SidebarSkeleton />
  ) : (
    <Sidebar data={data} />
  )}
</Suspense>
```

**Rules:**
- Wrap at component boundaries
- Fallback matches expected structure
- Graceful degradation on error

## Lazy Loading

Heavy components load on-demand:

```tsx
const NoteEditor = lazy(() => 
  import('@/features/editor/components/NoteEditor')
)
```

**Candidates for Lazy Loading:**
- Heavy third-party libraries
- Editor components
- Visualization components
- Rarely-used features

## Migration Guide

### Converting Existing Components

1. **Identify Loading States**
   ```tsx
   // Before: Single loading state
   const [data, setData] = useState([])
   
   // After: Separate initial/refresh
   const [data, setData] = useState([])
   const [isInitialLoading, setIsInitialLoading] = useState(true)
   const [isRefreshing, setIsRefreshing] = useState(false)
   ```

2. **Create Skeleton**
   ```tsx
   // Match exact structure
   function MySkeleton() {
     return (
       <div className="w-[210px]"> {/* Match real width */}
         <Skeleton className="h-7" /> {/* Match real height */}
       </div>
     )
   }
   ```

3. **Split Layout/Logic**
   ```tsx
   // Layout (pure)
   function MyComponentLayout({ content }) {
     return <div>{content}</div>
   }
   
   // Container (data)
   function MyComponentContainer() {
     const { data, isLoading } = useMyData()
     return (
       <MyComponentLayout 
         content={isLoading ? <MySkeleton /> : <MyComponent data={data} />}
       />
     )
   }
   ```

4. **Implement Non-Blocking Updates**
   ```tsx
   const updateData = async (id, changes) => {
     await api.update(id, changes)
     // Non-blocking refresh
     startTransition(() => {
       refreshData()
     })
   }
   ```

## Performance Benefits

- **No Layout Shifts**: CLS score of 0
- **Instant First Paint**: Skeleton renders in <16ms
- **Progressive Loading**: Each data source independent
- **Responsive During Updates**: UI never freezes
- **Optimized Bundle Size**: Lazy loading reduces initial JS

## Testing

Verify zero layout shifts:

1. Open Chrome DevTools → Performance
2. Record page load
3. Check "Experience" track for Layout Shifts
4. Should show zero CLS (Cumulative Layout Shift)

Verify non-blocking updates:

1. Open storage panel
2. Create/update/delete items
3. UI should remain interactive
4. No blocking spinners

## Future Enhancements

- [ ] Error boundaries with retry logic
- [ ] Optimistic UI updates
- [ ] Cache layer for instant renders
- [ ] Streaming SSR support
- [ ] Prefetching strategies

