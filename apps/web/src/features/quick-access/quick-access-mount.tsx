"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
	enterGotoMode,
	executeGotoDestination,
	exitGotoMode,
	GotoIndicators,
	isTypingContext,
	keyFromEvent,
	parseDurationMs,
	setGotoBuffer,
	useGotoMode,
	useGotoTargets,
	validateGotoTargets,
	type RegisteredGotoTarget,
} from "@/core/quick-access";
import { useShortcutScope } from "@/core/shortcuts";
import { usePreferencesStore } from "@/features/settings/store";

const DEFAULT_DURATION_MS = 2000;

/**
 * Owns go-to mode: the activation shortcut, the key-sequence listener, the
 * inactivity timeout, and the hint indicators. Mounted once at the app root.
 */
export function QuickAccessMount() {
	const router = useRouter();
	const active = useGotoMode((state) => state.active);
	const quickAccess = usePreferencesStore((state) => state.quickAccess);
	const validTargetsRef = useRef<RegisteredGotoTarget[]>([]);

	useShortcutScope(
		"app",
		{
			"app.gotoMode": (event) => {
				if (!quickAccess.allowInEditor && isTypingContext(event.target)) return;

				if (useGotoMode.getState().active) {
					exitGotoMode();
					return;
				}

				const { targets } = useGotoTargets.getState();
				const { valid, issues } = validateGotoTargets(Object.values(targets));
				if (issues.length > 0 && process.env.NODE_ENV !== "production") {
					for (const issue of issues) {
						console.error(`[quick-access] ${issue.message}`);
					}
				}
				if (valid.length === 0) return;

				validTargetsRef.current = valid;
				enterGotoMode(new Set(valid.map((target) => target.to.id)));
			},
		},
		{ active: quickAccess.enabled },
	);

	const durationMs = parseDurationMs(quickAccess.gotoModeDuration) ?? DEFAULT_DURATION_MS;

	useEffect(() => {
		if (!quickAccess.enabled && useGotoMode.getState().active) {
			exitGotoMode();
		}
	}, [quickAccess.enabled]);

	useEffect(() => {
		if (!active) return;

		let timeoutId = window.setTimeout(exitGotoMode, durationMs);

		function armTimeout() {
			window.clearTimeout(timeoutId);
			timeoutId = window.setTimeout(exitGotoMode, durationMs);
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				exitGotoMode();
				return;
			}

			const key = keyFromEvent(event);
			if (key === null) return;

			event.preventDefault();
			event.stopPropagation();

			const buffer = useGotoMode.getState().buffer + key;
			const targets = validTargetsRef.current;
			const exact = targets.find((target) => target.keybind === buffer);
			if (exact) {
				exitGotoMode();
				executeGotoDestination(exact.to, exact.element, router);
				return;
			}

			if (targets.some((target) => target.keybind.startsWith(buffer))) {
				setGotoBuffer(buffer);
				armTimeout();
				return;
			}

			exitGotoMode();
		}

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => {
			window.clearTimeout(timeoutId);
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, [active, durationMs, router]);

	if (!active || !quickAccess.showIndicators) return null;

	return (
		<GotoIndicators
			settings={{
				position: quickAccess.indicatorPosition,
				size: quickAccess.indicatorSize,
				opacity: quickAccess.indicatorOpacity,
			}}
		/>
	);
}
