import type { RecordActivityInput } from '../types'
import { recordActivity } from '../api/mutations/record-activity'

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
	recordActivity(input)
		.then((result) => {
			if (!result.success) {
				console.error('Activity tracking failed:', result.error)
			}
		})
		.catch((error) => {
			console.error('Failed to track activity (transport):', error)
		})
}
