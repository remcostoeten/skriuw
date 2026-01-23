import { CrudErrorCode, detectErrorCode } from "./codes";

/**
 * Structured error for CRUD operations.
 */
export type CrudError = {
	/** Machine-readable error code */
	code: CrudErrorCode
	/** Human-readable message */
	message: string
	/** Additional details */
	details?: Record<string, unknown>
	/** Stack trace (dev only) */
	stack?: string
}

/**
 * Creates a CrudError from an unknown error.
 */
export function createCrudError(error: unknown, defaultCode?: CrudErrorCode): CrudError {
	const message = error instanceof Error ? error.message : String(error)
	const code = defaultCode ?? detectErrorCode(message)

	return {
		code,
		message,
		stack:
			process.env.NODE_ENV === 'development' && error instanceof Error
				? error.stack
				: undefined
	}
}

/**
 * Creates a validation error.
 */
export function createValidationError(
	errors: Array<{ field: string; message: string; code: string }>
): CrudError {
	return {
		code: CrudErrorCode.VALIDATION_ERROR,
		message: 'Validation failed',
		details: { errors }
	}
}

/**
 * Creates a not found error.
 */
export function createNotFoundError(entityType: string, id: string): CrudError {
	return {
		code: CrudErrorCode.NOT_FOUND,
		message: `${entityType} with ID '${id}' not found`
	}
}
