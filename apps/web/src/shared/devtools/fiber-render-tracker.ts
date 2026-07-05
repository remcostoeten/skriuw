import { subscribeToCommits, type Fiber } from "./devtools-hook";

export type RenderEvent = {
	name: string;
	selfTimeMs: number;
	rect: DOMRect | null;
};

export type CommitEvent = {
	at: number;
	renders: RenderEvent[];
	totalTimeMs: number;
};

const PERFORMED_WORK = 0b1;
const FUNCTION_COMPONENT = 0;
const CLASS_COMPONENT = 1;
const FORWARD_REF = 11;
const MEMO_COMPONENT = 14;
const SIMPLE_MEMO_COMPONENT = 15;
const HOST_COMPONENT = 5;

const COMPONENT_TAGS = new Set([
	FUNCTION_COMPONENT,
	CLASS_COMPONENT,
	FORWARD_REF,
	MEMO_COMPONENT,
	SIMPLE_MEMO_COMPONENT,
]);

function fiberName(fiber: Fiber): string | null {
	const type = fiber.type as {
		displayName?: string;
		name?: string;
		render?: { displayName?: string; name?: string };
	} | null;
	if (!type) return null;
	return type.displayName ?? type.name ?? type.render?.displayName ?? type.render?.name ?? null;
}

function nearestHostRect(fiber: Fiber): DOMRect | null {
	let node: Fiber | null = fiber;
	let depth = 0;
	while (node && depth < 50) {
		if (node.tag === HOST_COMPONENT && node.stateNode instanceof Element) {
			return node.stateNode.getBoundingClientRect();
		}
		node = node.child;
		depth += 1;
	}
	return null;
}

function childrenDuration(fiber: Fiber): number {
	let total = 0;
	let child = fiber.child;
	while (child) {
		total += child.actualDuration ?? 0;
		child = child.sibling;
	}
	return total;
}

/**
 * Walks a committed fiber tree and reports every component that performed
 * render work in that commit, with its approximate self time and the screen
 * rect of its nearest DOM node. Returns an unsubscribe function, or null when
 * the devtools hook was not installed before react-dom loaded.
 */
export function trackRenders(onCommit: (commit: CommitEvent) => void): (() => void) | null {
	return subscribeToCommits((root) => {
		const renders: RenderEvent[] = [];
		let totalTimeMs = 0;

		const stack: Fiber[] = [root.current];
		while (stack.length > 0) {
			const fiber = stack.pop() as Fiber;
			if (fiber.child) stack.push(fiber.child);
			if (fiber.sibling) stack.push(fiber.sibling);

			if (!COMPONENT_TAGS.has(fiber.tag)) continue;
			if ((fiber.flags & PERFORMED_WORK) === 0) continue;
			const name = fiberName(fiber);
			if (!name) continue;

			const selfTimeMs = Math.max(0, (fiber.actualDuration ?? 0) - childrenDuration(fiber));
			totalTimeMs += selfTimeMs;
			renders.push({ name, selfTimeMs, rect: nearestHostRect(fiber) });
		}

		if (renders.length > 0) {
			onCommit({ at: performance.now(), renders, totalTimeMs });
		}
	});
}
