// CRUD Operations
export { useCRUD, createCRUDConfig } from "./crud";
export { create, read, update, destroy } from "./crud";

// Settings and User Preferences
export { useSettings, useTypedSettings } from "./settings";
export { useUserPreferences, useUserPreference, withUserPreference } from "./settings";
export { SettingsProvider } from "./settings";

// Query Management
export { createQueryKeys, createQueryOptions, createEntityQueries } from "./queries";
export { useQueryClient, useQueries, useInfiniteQuery, queryUtils, queryPerformance } from "./queries";
export { globalQueryKeys } from "./queries";

// Types
export type {
  // Base CRUD types
  BaseEntity,
  CreateResult,
  UpdateResult,
  DeleteResult,
  ReadResult,
  ListResult,
  CRUDResult,
  CRUDListResult,

  // Configuration types
  CRUDConfig,
  MutationOptions,
  OptimisticUpdate,

  // Settings and user preferences
  SettingsConfig,
  UserSetting,
  SettingsCategory,
  SettingsGroup,

  // Query types
  QueryKeys,
  QueryOptions,
} from "./types";

/**
 * Example usage for notes entity:
 *
 * import { useCRUD, createCRUDConfig } from "@/shared/data";
 *
 * const notesCRUD = useCRUD(createCRUDConfig('notes', {
 *   create: (data) => noteStorage.createNote(data),
 *   read: (id) => noteStorage.findNote(id),
 *   update: (id, data) => noteStorage.updateNote(id, data),
 *   delete: (id) => noteStorage.deleteItem(id),
 *   list: (filters) => noteStorage.getItems(),
 * }));
 *
 * const { create, read, update, deleteItem, isLoading } = notesCRUD;
 *
 * // For settings:
 * import { useSettings, useFeatureFlags } from "@/shared/data";
 *
 * const { theme, autoSave, setSetting } = useSettings();
 * const { hasAdvancedSearch, hasRealTimeCollaboration } = useFeatureFlags();
 */