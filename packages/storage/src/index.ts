// Export generic storage types and factory
export type {
	BaseEntity,
	GenericStorageAdapter,
	ReadOptions,
	StorageInfo,
	StorageCapabilities,
	StorageConfig,
	StorageEvent,
	StorageEventListener,
	StorageAdapterName,
	StorageAdapterType,
} from "./generic-types";

export {
        createGenericStorageAdapter,
        initializeGenericStorage,
        getGenericStorage,
        destroyGenericStorage,
        registerGenericStorageAdapter,
        getAvailableGenericAdapters,
} from "./generic-storage-factory";

export { createGenericLocalStorageAdapter } from "./adapters/generic-local-storage";

// Export CRUD operations
export * from "./crud";
