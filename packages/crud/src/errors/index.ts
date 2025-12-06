/**
 * @fileoverview Error exports for @skriuw/crud
 * @module @skriuw/crud/errors
 */

export { CrudErrorCode, detectErrorCode } from './codes'
export {
    createCrudError,
    createValidationError,
    createNotFoundError,
    type CrudError,
} from './error'
