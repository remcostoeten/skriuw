"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GotoTargetConfig } from "./goto-types";
import { normalizeKeybind } from "./key-sequence";
import { registerGotoTarget, setGotoTargetElement } from "./registry";

/**
 * Registers a go-to target for the lifetime of the calling component and
 * returns a ref callback to attach to the element the indicator should anchor
 * to. The destination must come from the centralized `goto` config; mounting
 * the same destination twice is rejected by the registry.
 */
export function useGotoTarget(config: GotoTargetConfig): (element: HTMLElement | null) => void {
	const enabled = config.enabled ?? true;
	const keybind = normalizeKeybind(config.keybind);
	const destinationId = config.to.id;
	const elementRef = useRef<HTMLElement | null>(null);
	const configRef = useRef(config);
	configRef.current = config;

	useEffect(() => {
		if (!enabled) return;

		const unregister = registerGotoTarget({
			keybind,
			to: configRef.current.to,
			label: configRef.current.label ?? configRef.current.to.label,
			element: elementRef.current,
		});
		return () => unregister?.();
	}, [enabled, keybind, destinationId]);

	return useCallback(
		(element: HTMLElement | null) => {
			elementRef.current = element;
			setGotoTargetElement(destinationId, element);
		},
		[destinationId],
	);
}
