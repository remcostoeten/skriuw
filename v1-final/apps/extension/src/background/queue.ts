import { postCapture } from "../shared/api";
import { readQueue, writeQueue } from "../shared/storage";
import type { TCapturePayload, TQueueItem } from "../shared/types";

const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 5 * 60 * 1_000;

function backoffDelay(attempts: number): number {
	return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

export async function enqueueCapture(payload: TCapturePayload): Promise<TQueueItem> {
	const item: TQueueItem = {
		id: crypto.randomUUID(),
		payload,
		attempts: 0,
		nextAt: 0,
	};
	const queue = await readQueue();
	queue.push(item);
	await writeQueue(queue);
	return item;
}

export async function flushQueue(now: number): Promise<void> {
	const queue = await readQueue();
	if (queue.length === 0) return;

	const remaining = (
		await Promise.all(
			queue.map(async (item): Promise<TQueueItem | null> => {
				if (item.nextAt > now) {
					return item;
				}

				const outcome = await postCapture(item.payload, item.id);
				if (outcome.ok) {
					return null;
				}
				if (!outcome.retryable || item.attempts + 1 >= MAX_ATTEMPTS) {
					return null;
				}
				return {
					...item,
					attempts: item.attempts + 1,
					nextAt: now + backoffDelay(item.attempts + 1),
				};
			}),
		)
	).filter((item): item is TQueueItem => item !== null);

	await writeQueue(remaining);
}
