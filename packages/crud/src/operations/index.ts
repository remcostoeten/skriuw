/**
 * @fileoverview Operations module exports
 * @module @skriuw/crud/operations
 */

export {
    create,
    batchCreate,
    setStorageAdapter as setCreateAdapter,
} from './create'

export {
    readOne,
    readMany,
    batchRead,
    setStorageAdapter as setReadAdapter,
} from './read'

export {
    update,
    batchUpdate,
    setStorageAdapter as setUpdateAdapter,
} from './update'

export {
    destroy,
    batchDestroy,
    setStorageAdapter as setDestroyAdapter,
} from './destroy'
