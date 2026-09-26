import { create } from "zustand";
import type { RegisteredGotoTarget } from "./goto-types";

type GotoTargetsState = {
	targets: Record<string, RegisteredGotoTarget>;
};

export const useGotoTargets = create<GotoTargetsState>(() => ({ targets: {} }));

/**
 * Registers a mounted go-to target keyed by its destination id. The smart hint
 * system derives meaning from the destination, so the same `to` may only be
 * mounted once — a second registration is rejected (and loudly reported in
 * development) instead of silently shadowing the first.
 */
export function registerGotoTarget(target: RegisteredGotoTarget): (() => void) | null {
	const { targets } = useGotoTargets.getState();
	if (targets[target.to.id]) {
		if (process.env.NODE_ENV !== "production") {
			console.error(
				`[quick-access] goto destination "${target.to.id}" is already registered by another mounted target; ignoring this registration`,
			);
		}
		return null;
	}

	useGotoTargets.setState((state) => ({
		targets: { ...state.targets, [target.to.id]: target },
	}));

	return function unregister() {
		useGotoTargets.setState((state) => {
			const next = { ...state.targets };
			delete next[target.to.id];
			return { targets: next };
		});
	};
}

export function setGotoTargetElement(destinationId: string, element: HTMLElement | null): void {
	useGotoTargets.setState((state) => {
		const target = state.targets[destinationId];
		if (!target || target.element === element) return state;
		return { targets: { ...state.targets, [destinationId]: { ...target, element } } };
	});
}
