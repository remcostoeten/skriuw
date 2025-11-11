import { initializeStorage } from "@/shared/storage";
import { getStorageConfig } from "./config";

let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the storage system with the appropriate adapter
 */
export async function initializeAppStorage(): Promise<void> {
  // Prevent multiple initializations
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = performInitialization();
  return initializationPromise;
}

async function performInitialization(): Promise<void> {
  try {
    const config = getStorageConfig();
    console.log(`Initializing storage with adapter: ${config.adapter}`);

    const storage = await initializeStorage(config);
    const info = await storage.getStorageInfo();

    console.log('Storage initialized successfully:', {
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
 * Get storage initialization status
 */
export function isStorageInitialized(): boolean {
  return initializationPromise !== null;
}

/**
 * Reset storage (for development/testing)
 */
export async function resetStorage(): Promise<void> {
  initializationPromise = null;
  return initializeAppStorage();
}