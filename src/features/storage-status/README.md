# Storage Status / Data Browser

An intuitive data browser for viewing and managing all stored data in your application.

## Features

- **Categorized View**: Storage keys are automatically organized into categories (Notes, Settings, Shortcuts, etc.)
- **Search**: Find data across all storage keys instantly
- **CRUD Operations**: Create, read, update, and delete items with a visual interface
- **Data Previews**: See actual data content, not just metadata
- **Codebase References**: Hover over keys to see which files and routes use them
- **JSON Editor**: Edit items directly as JSON

## Usage

1. Click the Database icon (bottom right) to open the data browser
2. Browse categories and expand storage keys
3. Use the search bar to filter data
4. Click the + icon to add new items
5. Use eye/edit/trash icons to view, modify, or delete items

## Adding Storage Key Metadata

When you create a new feature that uses storage, add metadata to help developers understand where the data is used:

### 1. Edit `src/features/storage-status/api/storage-metadata.ts`

```typescript
export const STORAGE_KEY_METADATA: Record<string, StorageKeyMetadata> = {
  // ... existing entries ...
  
  'your-new-storage-key': {
    feature: 'Your Feature Name',
    description: 'What this data stores',
    usedIn: [
      'src/features/your-feature/api/queries/get-data.ts',
      'src/features/your-feature/components/data-list.tsx',
    ],
    route: '/your-feature', // optional: associated route
  },
};
```

### 2. Update Categorization (Optional)

If your storage key doesn't fit existing categories, update the categorization logic in:

`src/features/storage-status/components/storage-status-panel.tsx`

Look for the `categorizeStorageKeys` function and add your pattern:

```typescript
function categorizeStorageKeys(data: StorageKeyData[]): CategorizedStorage[] {
  const categories: Record<string, StorageKeyData[]> = {
    'Notes & Content': [],
    'Settings': [],
    'Shortcuts': [],
    'Your New Category': [], // Add new category
    'Other': [],
  };

  data.forEach(item => {
    // Add your pattern matching
    if (item.key.toLowerCase().includes('your-pattern')) {
      categories['Your New Category'].push(item);
    }
    // ... existing patterns ...
  });

  // Add icon mapping
  const iconMap: Record<string, string> = {
    // ... existing icons ...
    'Your New Category': '🎯', // Add emoji icon
  };
  
  // ... rest of function
}
```

## Architecture

- **storage-status-panel.tsx**: Main data browser UI
- **storage-status-toggle.tsx**: Floating button to open/close
- **storage-metadata.ts**: Maps storage keys to features/files
- **queries/**: Data fetching utilities

## Tips

- The data preview shows the first 2 non-metadata fields of each item
- Metadata fields (id, createdAt, updatedAt) are hidden from previews
- Storage keys are automatically sorted into categories based on naming patterns
- Hover over the file/map icons next to storage keys to see usage details

