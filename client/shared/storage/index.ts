// Re-export storage functionality for clean imports
export type {
  StorageAdapter,
  StorageInfo,
  StorageCapabilities,
  StorageOperation,
  StorageOperationResult,
  StorageConfig,
  StorageEvent,
  StorageEventListener
} from "./types";

export {
  LocalStorageAdapter
} from "./implementations/LocalStorageAdapter";

export {
  createStorageAdapter,
  initializeStorage,
  getStorage,
  destroyStorage,
  registerStorageAdapter,
  getAvailableAdapters
} from "./StorageFactory";