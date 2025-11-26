# localStorage to Drizzle Migration Guide

This document maps all current localStorage keys to their new Drizzle schema equivalents.

## Migration Mapping

### Core Data Storage

| localStorage Key | Drizzle Table | Field Mapping | Notes |
|------------------|---------------|---------------|-------|
| `"Skriuw_notes"` | `notes` + `folders` | Direct migration | Notes → `notes` table, Folders → `folders` table |
| `"app:settings"` | `app_settings` | `key` = setting name, `value` = JSON value | Already handled in adapter |

### UI State Storage

| localStorage Key | Drizzle Table | Field Mapping | Example |
|------------------|---------------|---------------|---------|
| `"Skriuw_expanded_folders"` | `ui_state` | `key` = "expanded_folders", `value` = JSON array | `["folder1", "folder2"]` |
| `'skriuw_editor_tabs_state'` | `ui_state` | `key` = "editor_tabs_state", `value` = JSON object | `{activeTab: "note1", tabs: [...]}` |
| `'data-browser-toggle-position'` | `ui_state` | `key` = "data_browser_toggle_position", `value` = JSON | `{x: 100, y: 200}` |
| `'data-browser-panel-position'` | `ui_state` | `key` = "data_browser_panel_position", `value` = JSON | `{x: 50, y: 50}` |
| `'data-browser-panel-opacity'` | `ui_state` | `key` = "data_browser_panel_opacity", `value` = JSON | `0.9` |

### Feature-Specific Storage

| localStorage Key | Drizzle Table | Field Mapping | Notes |
|------------------|---------------|---------------|-------|
| `"quantum-works:shortcuts:custom"` | `shortcuts` | `shortcutId` = action, `keyCombos` = JSON array | Already handled in adapter |
| `'storageStatus.eventLog'` | `event_logs` | `category` = "storage", `message` = event, `metadata` = JSON | Migrate existing logs |

### System Storage

| localStorage Key | Drizzle Table | Field Mapping | Environment |
|------------------|---------------|---------------|-------------|
| `'storage.preference'` | `system_config` | `key` = "storage_preference", `value` = JSON | "user" |
| `'storage.schemaVersion'` | `system_config` | `key` = "schema_version", `value` = JSON | "system" |

## Implementation Steps

### 1. Generate Migration

```bash
pnpm drizzle:generate:web  # or desktop/libsql/sqlite variants
```

### 2. Update Storage Adapters

Your `generic-drizzle-libsql-http.ts` adapter already handles some of these. You'll need to extend it to support:

```typescript
// Add to your adapter
const UI_STATE_KEYS = {
  EXPANDED_FOLDERS: "expanded_folders",
  EDITOR_TABS: "editor_tabs_state", 
  DATA_BROWSER_TOGGLE: "data_browser_toggle_position",
  DATA_BROWSER_PANEL: "data_browser_panel_position",
  DATA_BROWSER_OPACITY: "data_browser_panel_opacity"
};

const SYSTEM_KEYS = {
  STORAGE_PREFERENCE: "storage_preference",
  SCHEMA_VERSION: "schema_version"
};
```

### 3. Migration Script

Create a one-time migration script:

```typescript
// scripts/migrate-localstorage.ts
export async function migrateLocalStorageToDrizzle() {
  // 1. Read all localStorage keys
  // 2. For each key, insert into appropriate Drizzle table
  // 3. Clear localStorage after successful migration
  // 4. Update adapter to use Drizzle going forward
}
```

### 4. Update Components

Update components to use the new storage layer:

```typescript
// Example: sidebar-component.tsx
// Instead of:
localStorage.getItem(EXPANDED_FOLDERS_KEY)

// Use:
const storage = getGenericStorage();
const result = await storage.read('ui_state', { getById: 'expanded_folders' });
```

## Benefits of Migration

1. **✅ Multi-device sync** - All data syncs across devices
2. **✅ Query performance** - Indexed queries vs JSON parsing
3. **✅ Data integrity** - Foreign key constraints and validation
4. **✅ Type safety** - Full TypeScript support
5. **✅ Backup/restore** - Proper database backups
6. **✅ Analytics** - Queryable event logs and usage patterns

## Rollback Plan

If needed, you can rollback by:

1. Export data from Drizzle tables
2. Import back to localStorage format
3. Switch adapter back to localStorage

## Testing

1. **Test migration script** on development data
2. **Verify all localStorage keys** are migrated
3. **Test UI components** work with new storage
4. **Test sync behavior** across multiple devices
5. **Test performance** improvements

## Priority Order

1. **High Priority**: Core data (notes, folders, settings)
2. **Medium Priority**: UI state (expanded folders, editor tabs)
3. **Low Priority**: System config, event logs

The migration can be done incrementally - start with core data, then add UI state later.
