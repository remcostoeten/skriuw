/**
 * @fileoverview Error Code Detection Tests
 * Tests the error message to code mapping logic
 */

import { describe, it, expect } from 'vitest'
import { CrudErrorCode, detectErrorCode } from './codes'

describe('Error Code Detection', () => {
    describe('detectErrorCode', () => {
        it('should detect NOT_FOUND errors', () => {
            expect(detectErrorCode('Entity not found')).toBe(CrudErrorCode.NOT_FOUND)
            expect(detectErrorCode('Note NOT FOUND in database')).toBe(CrudErrorCode.NOT_FOUND)
            expect(detectErrorCode('Resource was not found')).toBe(CrudErrorCode.NOT_FOUND)
        })

        it('should detect ALREADY_EXISTS errors', () => {
            expect(detectErrorCode('Duplicate key violation')).toBe(CrudErrorCode.ALREADY_EXISTS)
            expect(detectErrorCode('Unique constraint failed')).toBe(CrudErrorCode.ALREADY_EXISTS)
            expect(detectErrorCode('duplicate entry for key')).toBe(CrudErrorCode.ALREADY_EXISTS)
        })

        it('should detect CONSTRAINT_VIOLATION errors', () => {
            expect(detectErrorCode('Foreign key constraint failed')).toBe(CrudErrorCode.CONSTRAINT_VIOLATION)
            expect(detectErrorCode('Constraint violation on insert')).toBe(CrudErrorCode.CONSTRAINT_VIOLATION)
        })

        it('should detect VALIDATION_ERROR errors', () => {
            expect(detectErrorCode('Validation failed')).toBe(CrudErrorCode.VALIDATION_ERROR)
            expect(detectErrorCode('Input validation error')).toBe(CrudErrorCode.VALIDATION_ERROR)
        })

        it('should detect PERMISSION_DENIED errors', () => {
            expect(detectErrorCode('Permission denied')).toBe(CrudErrorCode.PERMISSION_DENIED)
            expect(detectErrorCode('Access denied for resource')).toBe(CrudErrorCode.PERMISSION_DENIED)
        })

        it('should detect NETWORK_ERROR errors', () => {
            expect(detectErrorCode('Network request failed')).toBe(CrudErrorCode.NETWORK_ERROR)
            expect(detectErrorCode('Failed to fetch resource')).toBe(CrudErrorCode.NETWORK_ERROR)
        })

        it('should detect TIMEOUT errors', () => {
            expect(detectErrorCode('Request timeout exceeded')).toBe(CrudErrorCode.TIMEOUT)
            expect(detectErrorCode('Operation timed out')).toBe(CrudErrorCode.TIMEOUT)
        })

        it('should detect STORAGE_FULL errors', () => {
            expect(detectErrorCode('Storage quota exceeded')).toBe(CrudErrorCode.STORAGE_FULL)
            expect(detectErrorCode('Database is full')).toBe(CrudErrorCode.STORAGE_FULL)
        })

        it('should default to INTERNAL_ERROR for unknown messages', () => {
            expect(detectErrorCode('Something went wrong')).toBe(CrudErrorCode.INTERNAL_ERROR)
            expect(detectErrorCode('Unknown error occurred')).toBe(CrudErrorCode.INTERNAL_ERROR)
            expect(detectErrorCode('')).toBe(CrudErrorCode.INTERNAL_ERROR)
        })

        it('should be case-insensitive', () => {
            expect(detectErrorCode('NOT FOUND')).toBe(CrudErrorCode.NOT_FOUND)
            expect(detectErrorCode('not found')).toBe(CrudErrorCode.NOT_FOUND)
            expect(detectErrorCode('Not Found')).toBe(CrudErrorCode.NOT_FOUND)
        })
    })
})
