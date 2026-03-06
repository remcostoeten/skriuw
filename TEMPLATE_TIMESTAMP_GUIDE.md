# Template Timestamp System Documentation

## Overview

The template system now includes comprehensive timestamp tracking for each template style (Simple, Notion, Journal). These timestamps automatically update whenever templates are accessed or used, providing users with clear visibility into template usage patterns and modification history.

## Key Features

### 1. Automatic Timestamp Management

Each template maintains four key timestamps:

- **createdAt**: Automatically set when the template is first accessed (in DEFAULT_SETTINGS)
- **updatedAt**: Updates whenever the template style is changed in settings
- **lastUsedAt**: Updates when a note is created using the template
- **useCount**: Increments each time a note is created with the template

### 2. Timestamp Tracking Flow

```
User selects template in Settings
    ↓
updateTemplateStyle() called
    ↓
templateTimestamps[style].updatedAt = now
    ↓
Settings persisted to localStorage
    ↓
User creates a note with active template
    ↓
createFile() called in notesStore
    ↓
recordTemplateUsage(template) called
    ↓
templateTimestamps[style].lastUsedAt = now
templateTimestamps[style].useCount++
    ↓
Settings persisted to localStorage
```

### 3. Data Persistence

All timestamps are automatically persisted to localStorage through Zustand's persist middleware. This ensures:
- Timestamps survive browser refreshes
- User preferences are maintained across sessions
- Template usage statistics accumulate over time

## Implementation Details

### Types and Interfaces

```typescript
type TemplateTimestamp = {
  createdAt: Date;      // When template was first available
  updatedAt: Date;      // Last time template was modified/selected
  lastUsedAt: Date | null;  // Last note created with this template
  useCount: number;     // Total notes created with this template
};

type UserSettings = {
  // ... other settings
  templateTimestamps: Record<TemplateStyle, TemplateTimestamp>;
};
```

### Store Methods

#### `getTemplateTimestamp(style: TemplateStyle): TemplateTimestamp`
Retrieves the timestamp object for a specific template style. Returns an initialized timestamp if none exists.

#### `updateTemplateStyle(style: TemplateStyle): void`
Called when user selects a different template. Updates the `updatedAt` timestamp for the selected template.

#### `recordTemplateUsage(style: TemplateStyle): void`
Called when a note is created. Updates both `lastUsedAt` and increments `useCount` for the template used.

### Component Display

The TemplateSelector component displays timestamp information in three columns:

#### Created Column
- Shows absolute date: `"Mar 6, 2026"`
- Shows relative time: `"just now"` or `"2 days ago"`

#### Modified Column
- Shows when template settings were last changed
- Uses same date format as Created column
- Helps track which templates are actively managed

#### Used Column
- Shows usage statistics: `"3 times"`
- Shows last usage with relative time
- Displays `"Never used"` if template hasn't been used yet

## Design Improvements

### Visual Organization

1. **Three-Column Stats Grid**
   - Clear separation of concerns (creation, modification, usage)
   - Compact layout maximizes information density
   - Color-coded with standard design tokens

2. **Selection Indicator**
   - "Active" badge shows currently selected template
   - Visual border emphasis for selected template
   - Hover effects for unselected templates

3. **Template Preview**
   - Syntax-highlighted code block
   - Scrollable for longer content
   - Clear visual separation from metadata

4. **Icon Row**
   - Uses intuitive icons (Calendar, RotateCw, TrendingUp)
   - Combines multiple data points efficiently
   - Provides quick visual scanning

### Accessibility Improvements

- Semantic HTML structure for screen readers
- Clear label hierarchy (headings, descriptions)
- Sufficient color contrast ratios
- Keyboard navigation support via Radix UI

## Usage Scenarios

### Scenario 1: User Checks Template Creation Date

```
User opens Settings → Note Template Settings
Views "Created: Mar 6, 2026 (just now)"
Understands template was just initialized
```

### Scenario 2: User Sees Template Usage Statistics

```
User selects "Journal" template
Views "Used: 5 times" with "last used 1 day ago"
Confirms this is their active template
Decides to keep it as default
```

### Scenario 3: User Tracks Template Evolution

```
User compares all three templates:
- Simple: Created today, modified today, used 12 times
- Notion: Created today, modified 2 days ago, used 3 times
- Journal: Created today, never used
Recognizes Simple is their most-used template
```

## Performance Considerations

1. **Minimal Storage Impact**
   - Each timestamp is ~40 bytes
   - All three templates: ~120 bytes total
   - Negligible impact on localStorage quota

2. **Efficient Updating**
   - Updates only the modified template's record
   - No full settings object reconstruction needed
   - Batched with note creation tracking

3. **Date Formatting**
   - Uses date-fns (already in dependencies)
   - Formatting happens only on render
   - No computational overhead

## Future Enhancements

Potential improvements for later iterations:

1. **Template Analytics Dashboard**
   - Show usage trends over time
   - Visualize most popular templates
   - Recommend templates based on patterns

2. **Template Archiving**
   - Archive unused templates
   - Restore archived templates with history
   - Clean up stale templates

3. **Template Sharing**
   - Export templates with metadata
   - Share with other users
   - Include timestamp metadata in exports

4. **Template Scheduling**
   - Set templates to auto-enable on dates
   - Seasonal templates (e.g., Journal in January)
   - Reminder notifications when templates haven't been used

## Troubleshooting

### Timestamps Not Updating

**Problem**: Created/Modified dates stay the same
**Solution**: 
1. Check browser console for errors
2. Verify localStorage is enabled
3. Clear localStorage and reinitialize settings
4. Check that updateTemplateStyle is called

### useCount Not Incrementing

**Problem**: "Used: 0 times" even after creating notes
**Solution**:
1. Verify recordTemplateUsage is called in createFile
2. Check that template style matches in settings and note creation
3. Ensure Zustand store is properly initialized
4. Check localStorage for templateTimestamps key

### Relative Dates Showing Wrong Time

**Problem**: "2 days ago" but should be "yesterday"
**Solution**:
1. Check system clock is correct
2. Verify date-fns is imported correctly
3. Check browser timezone settings
4. Clear browser cache

## Code Examples

### Adding a New Template with Timestamps

```typescript
// In DEFAULT_SETTINGS
templateTimestamps: {
  simple: createInitialTimestamp(),
  notion: createInitialTimestamp(),
  journal: createInitialTimestamp(),
  custom: createInitialTimestamp(), // New template
}
```

### Accessing Template Stats in Components

```typescript
const { getTemplateTimestamp } = useSettingsStore();

const timestamp = getTemplateTimestamp('notion');
console.log(`Created: ${timestamp.createdAt}`);
console.log(`Last used: ${timestamp.lastUsedAt}`);
console.log(`Used ${timestamp.useCount} times`);
```

### Manual Timestamp Reset

```typescript
const resetTemplateTimestamp = useCallback((style: TemplateStyle) => {
  const { settings } = get();
  const templateTimestamps = { ...settings.templateTimestamps };
  templateTimestamps[style] = createInitialTimestamp();
  set({
    settings: { ...settings, templateTimestamps }
  });
}, []);
```

## Testing the Implementation

### Manual Testing Steps

1. **Create a new note**
   - Open Settings
   - Select a template
   - Note the "Modified" timestamp
   - Create a new note
   - Check "Last used" timestamp updated
   - Verify "Used: 1" count

2. **Switch templates**
   - Select different template in Settings
   - Verify "Modified" timestamp changes
   - Create note with new template
   - Check usage stats updated

3. **Persistence test**
   - Set template and create notes
   - Refresh browser
   - Open Settings
   - Verify all timestamps persisted
   - Check counts are accurate

### Automated Test Example

```typescript
describe('Template Timestamps', () => {
  it('should update timestamp when template is selected', () => {
    const { updateTemplateStyle, getTemplateTimestamp } = store;
    const before = new Date();
    
    updateTemplateStyle('notion');
    
    const timestamp = getTemplateTimestamp('notion');
    expect(timestamp.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('should increment useCount when note is created', () => {
    recordTemplateUsage('simple');
    let timestamp = getTemplateTimestamp('simple');
    const initialCount = timestamp.useCount;
    
    recordTemplateUsage('simple');
    timestamp = getTemplateTimestamp('simple');
    
    expect(timestamp.useCount).toBe(initialCount + 1);
  });
});
```

## Summary

The template timestamp system provides:
- ✅ Automatic timestamp tracking without user intervention
- ✅ Accurate modification history for auditing
- ✅ Usage statistics for behavior analysis
- ✅ Clean, organized UI display with visual hierarchy
- ✅ Persistent storage across browser sessions
- ✅ Foundation for future analytics features
