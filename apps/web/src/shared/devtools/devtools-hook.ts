/**
 * Access to the React DevTools global hook. React binds to
 * `__REACT_DEVTOOLS_GLOBAL_HOOK__` once at react-dom init, so a minimal stub
 * must exist before react-dom loads for commit callbacks to fire without the
 * browser extension. `installDevtoolsHookStub` provides that stub; call it
 * from a module evaluated before anything imports react-dom (importing this
 * file first in the app entry is enough with bundled module ordering).
 */

type FiberRoot = { current: Fiber };

export type Fiber = {
	tag: number;
	type: unknown;
	flags: number;
	stateNode: unknown;
	actualDuration?: number;
	child: Fiber | null;
	sibling: Fiber | null;
	return: Fiber | null;
	alternate: Fiber | null;
	memoizedProps: unknown;
};

type DevtoolsHook = {
	renderers: Map<number, unknown>;
	supportsFiber: boolean;
	inject: (renderer: unknown) => number;
	onCommitFiberRoot: (rendererId: number, root: FiberRoot, ...rest: unknown[]) => void;
	onCommitFiberUnmount: (...args: unknown[]) => void;
	onScheduleFiberRoot?: (...args: unknown[]) => void;
	checkDCE?: (...args: unknown[]) => void;
};

type HookGlobal = typeof globalThis & {
	__REACT_DEVTOOLS_GLOBAL_HOOK__?: DevtoolsHook;
};

function noop() {}

export function installDevtoolsHookStub(): void {
	const scope = globalThis as HookGlobal;
	if (scope.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;

	let nextRendererId = 1;
	scope.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
		renderers: new Map(),
		supportsFiber: true,
		inject(renderer) {
			const id = nextRendererId++;
			this.renderers.set(id, renderer);
			return id;
		},
		onCommitFiberRoot: noop,
		onCommitFiberUnmount: noop,
		onScheduleFiberRoot: noop,
		checkDCE: noop,
	};
}

export type CommitListener = (root: FiberRoot) => void;

/**
 * Chains a commit listener onto the devtools hook (stub or real extension
 * hook), preserving any existing subscriber. Returns an unsubscribe function,
 * or null when no hook exists — meaning react-dom initialized without one and
 * commits cannot be observed this session.
 */
export function subscribeToCommits(listener: CommitListener): (() => void) | null {
	const hook = (globalThis as HookGlobal).__REACT_DEVTOOLS_GLOBAL_HOOK__;
	if (!hook) return null;

	const previous = hook.onCommitFiberRoot.bind(hook);
	hook.onCommitFiberRoot = (rendererId, root, ...rest) => {
		previous(rendererId, root, ...rest);
		try {
			listener(root);
		} catch {
			// A tracker crash must never break React's commit phase.
		}
	};

	return () => {
		hook.onCommitFiberRoot = previous;
	};
}
