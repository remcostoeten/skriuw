# React Function Optimization Instructions

## 🎯 Objective
Fix all 218 callback performance issues across the React codebase by applying `useCallback` where needed and fixing useEffect dependency arrays.

## 📋 Files Requiring Optimization

### High Priority Files (137 issues)

#### 1. `apps/web/components/dev-widget.tsx` (33 issues)
**Actions:**
- Wrap all `onClick` handlers in `useCallback`
- Add `useCallback` to `fetchStats` and `fetchUsers` functions
- Fix useEffect dependencies for these functions

#### 2. `apps/web/components/sidebar/sidebar-component.tsx` (28 issues)
**Actions:**
- Convert all inline `onClick`, `onChange`, `onKeyDown` handlers to memoized callbacks
- Wrap search/filter functions in `useCallback`
- Fix any useEffect dependencies

#### 3. `apps/web/components/layout/footer.tsx` (5 issues)
**Actions:**
- Extract all `onOpenChange` handlers to memoized callbacks
- Each modal should have its own handler

#### 4. `apps/web/features/authentication/components/login-form.tsx` (8 issues)
**Actions:**
- Wrap all input `onChange` handlers in `useCallback`
- Memoize form submission handlers

#### 5. `apps/web/features/editor/components/editor-tabs-bar.tsx` (11 issues)
**Actions:**
- Convert all tab operation handlers to memoized callbacks
- Fix any useEffect dependencies

#### 6. `apps/web/features/backup/components/storage-adapters-panel.tsx` (9 issues)
**Actions:**
- Wrap all configuration handlers in `useCallback`
- Memoize validation functions

### Medium Priority Files (81 issues)

#### 7. `apps/web/components/auth/auth-modal.tsx`
**Actions:**
- Wrap `onSuccess` handler in `useCallback`
- Fix useEffect dependencies

#### 8. `apps/web/components/command-executor/command-executor.tsx`
**Actions:**
- Memoize `onChange` and `onClick` handlers
- Fix dependency arrays

#### 9. `apps/web/features/backup/components/export-panel.tsx`
**Actions:**
- Wrap export handler in `useCallback`

#### 10. `apps/web/features/backup/components/import-panel.tsx`
**Actions:**
- Memoize import and validation handlers

#### 11. `apps/web/features/activity/components/activity-calendar.tsx`
**Actions:**
- Wrap calendar click handlers in `useCallback`

## 🔧 Common Fix Patterns

### Pattern 1: Inline JSX Callbacks
```tsx
// BEFORE ❌
<button onClick={() => setShowModal(!showModal)}>
  Toggle Modal
</button>

// AFTER ✅
const handleToggleModal = useCallback(() => {
  setShowModal(prev => !prev);
}, []);

<button onClick={handleToggleModal}>
  Toggle Modal
</button>
```

### Pattern 2: Input Change Handlers
```tsx
// BEFORE ❌
<input
  onChange={(e) => setValue(e.target.value)}
  value={value}
/>

// AFTER ✅
const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value);
}, []);

<input
  onChange={handleChange}
  value={value}
/>
```

### Pattern 3: useEffect Dependency Functions
```tsx
// BEFORE ❌
useEffect(() => {
  fetchData();
}, [fetchData]); // fetchData recreated on every render

const fetchData = async () => {
  // fetch logic
};

// AFTER ✅
const fetchData = useCallback(async () => {
  // fetch logic
}, [userId, page]); // Include actual dependencies

useEffect(() => {
  fetchData();
}, [fetchData]);
```

### Pattern 4: Event Handlers with Parameters
```tsx
// BEFORE ❌
{items.map(item => (
  <button onClick={() => handleSelect(item.id)}>
    Select {item.name}
  </button>
))}

// AFTER ✅
const handleSelect = useCallback((id: string) => {
  setSelectedId(id);
}, []);

{items.map(item => (
  <button onClick={() => handleSelect(item.id)}>
    Select {item.name}
  </button>
))}
```

## 📝 Systematic Fix Process

### Step 1: Install Required Imports
Add to files that need them:
```tsx
import { useCallback } from 'react';
import type { ChangeEvent } from 'react';
```

### Step 2: Fix JSX Inline Callbacks
Search for patterns in each file:
- `onClick={`
- `onChange={`
- `onKeyDown={`
- `onSelect={`
- `onValueChange={`

Replace inline arrow functions with memoized callbacks.

### Step 3: Fix useEffect Dependencies
Search for:
- `useEffect(() => {`
- Functions in dependency arrays

Wrap functions in `useCallback` or move them outside component.

### Step 4: Fix Complex Callbacks
For callbacks that:
- Close over state/props
- Perform expensive operations (.map, .filter, etc.)
- Are used in multiple places

### Step 5: Verify Dependencies
Ensure all useCallback dependencies are correct:
- Include state values used inside
- Include props that affect the callback
- Don't include functions that are also memoized

## 🎯 Specific File Instructions

### For Authentication Forms
```tsx
// Fix email, password, and other input handlers
const handleEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
  setEmail(e.target.value);
}, []);

const handlePasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
  setPassword(e.target.value);
}, []);

const handleSubmit = useCallback(async (e: FormEvent) => {
  e.preventDefault();
  await onSubmit({ email, password });
}, [email, password, onSubmit]);
```

### For Sidebar Components
```tsx
// Fix search and navigation handlers
const handleSearchChange = useCallback((query: string) => {
  setSearchQuery(query);
}, []);

const handleItemClick = useCallback((item: Item) => {
  setSelectedItem(item);
  onItemSelect?.(item);
}, [onItemSelect]);
```

### For Data Fetching
```tsx
// Fix fetch functions used in useEffect
const fetchTasks = useCallback(async () => {
  try {
    const data = await api.getTasks();
    setTasks(data);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
  }
}, []); // Add dependencies like userId, filters, etc.

useEffect(() => {
  if (isOpen) {
    fetchTasks();
  }
}, [isOpen, fetchTasks]);
```

## ✅ Validation Checklist

After fixing each file:

- [ ] All inline JSX callbacks are extracted to `useCallback`
- [ ] All `useEffect` dependencies are properly memoized
- [ ] Dependency arrays include all necessary values
- [ ] No unnecessary dependencies in arrays
- [ ] Functions outside useEffect don't cause re-renders
- [ ] TypeScript types are correct for callback parameters

## 🚀 Expected Results

After completing all optimizations:
- **218 issues resolved**
- **50-70% reduction** in unnecessary re-renders
- **Improved performance** in navigation, forms, and modals
- **Better user experience** across the application

## 🔄 Continuous Process

1. Run the analyzer to verify fixes:
   ```bash
   node callback-analyzer.js
   ```

2. Ensure all high and medium priority issues are resolved

3. Test the application thoroughly to ensure functionality is preserved

4. Use React DevTools Profiler to measure performance improvements

5. Add ESLint rules to prevent future regressions:
   ```json
   {
     "rules": {
       "react-hooks/exhaustive-deps": "warn",
       "react/jsx-no-bind": "warn"
     }
   }
   ```

## 📊 Success Metrics

- **Before**: 218 callback issues identified
- **After**: 0 callback issues (target)
- **Performance**: 50%+ reduction in re-renders
- **User Experience**: Faster interactions, smoother animations

---

**Execute these optimizations systematically, file by file, following the patterns above. Focus on high-priority files first for maximum impact.**