import { initializeGenericStorage } from "@/api/storage/generic-storage-factory";

import { getStorageConfig } from "./config";

let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the storage system with the generic adapter
 */
export async function initializeAppStorage(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = performInitialization();
  return initializationPromise;
}

async function performInitialization(): Promise<void> {
  try {
    const config = getStorageConfig();
    console.info(`Initializing storage with adapter: ${config.adapter}`);

    const storage = await initializeGenericStorage(config);
    const info = await storage.getStorageInfo();

    console.info('Storage initialized successfully:', {
      adapter: info.adapter,
      type: info.type,
      totalItems: info.totalItems,
      capabilities: info.capabilities,
    });

  } catch (error) {
    console.error('Failed to initialize storage:', error);
    throw error;
  }
}

/**
 * Reset storage (for development/testing)
 */
export async function _resetStorage(): Promise<void> {
  initializationPromise = null;
  return initializeAppStorage();
}