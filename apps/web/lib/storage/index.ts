/**
 * @fileoverview Storage Layer Exports
 * @description Exports single hybrid adapter instance for the application
 */

import { createHybridAdapter } from './adapters/hybrid-adapter'

export const storageAdapter = createHybridAdapter()

// Re-export adapters for advanced usage
export { createHybridAdapter } from './adapters/hybrid-adapter'
export { createLocalStorageAdapter } from './adapters/local-storage'
export { createClientApiAdapter } from './adapters/client-api'
