import { recordActivity } from '../api/mutations/record-activity'
import type { RecordActivityInput } from '../types'

/**
 * Fire-and-forget activity tracking.
 * Use this in mutations to track user actions without blocking the main operation.
 *
 * @example
 * ```ts
 * trackActivity({
 *   entityType: 'note',
 *   entityId: note.id,
 *   action: 'created',
 *   entityName: note.name
 * })
 * ```
 */
export function trackActivity(input: RecordActivityInput): void {
	recordActivity(input)
		.then((result) => {
			if (!result.success) {
				// Ignore auth errors for guest users
				if (result.error === 'Authentication required') return

				console.error('Activity tracking failed:', result.error)
			}
		})
		.catch((error) => {
			console.error('Failed to track activity (transport):', error)
		})
}
