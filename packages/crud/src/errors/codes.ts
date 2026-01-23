/**
 * @fileoverview Error codes for CRUD operations
 * @module @skriuw/crud/errors/codes
 */

/**
 * Error codes for CRUD operations.
 */
export const CrudErrorCode = {
	NOT_FOUND: 'NOT_FOUND',
	ALREADY_EXISTS: 'ALREADY_EXISTS',
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
	PERMISSION_DENIED: 'PERMISSION_DENIED',
	NETWORK_ERROR: 'NETWORK_ERROR',
	TIMEOUT: 'TIMEOUT',
	STORAGE_FULL: 'STORAGE_FULL',
	INTERNAL_ERROR: 'INTERNAL_ERROR',
	BATCH_PARTIAL_FAILURE: 'BATCH_PARTIAL_FAILURE'
} as const

export type CrudErrorCode = (typeof CrudErrorCode)[keyof typeof CrudErrorCode]

/**
 * Maps error messages to error codes.
 */
export function detectErrorCode(message: string): CrudErrorCode {
	const lowerMessage = message.toLowerCase()

	if (lowerMessage.includes('not found')) return CrudErrorCode.NOT_FOUND
	if (lowerMessage.includes('duplicate') || lowerMessage.includes('unique'))
		return CrudErrorCode.ALREADY_EXISTS
	if (lowerMessage.includes('constraint') || lowerMessage.includes('foreign key'))
		return CrudErrorCode.CONSTRAINT_VIOLATION
	if (lowerMessage.includes('validation')) return CrudErrorCode.VALIDATION_ERROR
	if (lowerMessage.includes('permission') || lowerMessage.includes('denied'))
		return CrudErrorCode.PERMISSION_DENIED
	if (lowerMessage.includes('network') || lowerMessage.includes('fetch'))
		return CrudErrorCode.NETWORK_ERROR
	if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out'))
		return CrudErrorCode.TIMEOUT
	if (lowerMessage.includes('full') || lowerMessage.includes('quota'))
		return CrudErrorCode.STORAGE_FULL

	return CrudErrorCode.INTERNAL_ERROR
}
