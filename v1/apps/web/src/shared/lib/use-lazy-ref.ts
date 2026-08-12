import { type MutableRefObject, useRef } from "react";

/**
 * Ref whose initial value is built once on the first render, instead of
 * rebuilding (and discarding) the initializer result on every render like
 * `useRef(new Map())` does.
 */
export function useLazyRef<T>(init: () => T): MutableRefObject<T> {
	const ref = useRef<T | null>(null);
	if (ref.current === null) {
		ref.current = init();
	}
	return ref as MutableRefObject<T>;
}
