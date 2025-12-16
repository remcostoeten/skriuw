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
export function trackActivity(input: RecordActivityInput): void {
	recordActivity(input).catch(() => {})
}
