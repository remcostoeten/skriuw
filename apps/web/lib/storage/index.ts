/**
 * @fileoverview Storage Layer Exports
 * @description Exports single hybrid adapter instance for the application
 */

import { createHybridAdapter } from './adapters/hybrid-adapter'

// Define StorageAdapter type locally since crud package has issues
interface StorageAdapter {
    name: string
    read<T>(key: string, options?: any): Promise<T[] | T | undefined>
    readOne<T>(key: string, id: string, options?: any): Promise<T | null>
    readMany<T>(key: string, options?: any): Promise<T[]>
    create<T>(key: string, data: any, options?: any): Promise<T>
    update<T>(key: string, id: string, data: any, options?: any): Promise<T | undefined>
    delete(key: string, id: string, options?: any): Promise<boolean>
    batchCreate<T>(key: string, items: any[], options?: any): Promise<T[]>
    batchRead<T>(key: string, ids: string[], options?: any): Promise<T[]>
    batchUpdate<T>(key: string, updates: { id: string; data: any }[], options?: any): Promise<T[]>
    batchDelete(key: string, ids: string[], options?: any): Promise<number>
}

export const storageAdapter: StorageAdapter = createHybridAdapter()

// Re-export adapters for advanced usage
export { createHybridAdapter } from './adapters/hybrid-adapter'
export { createLocalStorageAdapter } from './adapters/local-storage'
export { createClientApiAdapter } from './adapters/client-api'
