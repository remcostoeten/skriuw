"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { GotoIndicatorPosition, GotoIndicatorSize, RegisteredGotoTarget } from "./goto-types";
import { useGotoMode } from "./mode";
import { useGotoTargets } from "./registry";

export type GotoIndicatorSettings = {
	position: GotoIndicatorPosition;
	size: GotoIndicatorSize;
	opacity: number;
};

type IndicatorProps = {
	target: RegisteredGotoTarget;
	element: HTMLElement;
	settings: GotoIndicatorSettings;
};

function GotoIndicator({ target, element, settings }: IndicatorProps) {
	// The indicator positions absolutely inside its anchor; only force
	// `position: relative` on anchors that are statically positioned so
	// already-positioned elements keep their layout.
	useEffect(() => {
		if (getComputedStyle(element).position !== "static") return;
		element.setAttribute("data-goto-target-anchor", "true");
		return () => element.removeAttribute("data-goto-target-anchor");
	}, [element]);

	return createPortal(
		<kbd
			data-goto-indicator
			data-position={settings.position}
			data-size={settings.size}
			style={{ opacity: settings.opacity }}
			aria-label={`Go to ${target.label}`}
		>
			{target.keybind}
		</kbd>,
		element,
	);
}

type Props = {
	settings: GotoIndicatorSettings;
};

/**
 * Renders a `<kbd>` hint inside every validated go-to target while the mode is
 * active. Targets whose keybind no longer matches the typed prefix drop out as
 * the user narrows the sequence.
 */
export function GotoIndicators({ settings }: Props) {
	const targets = useGotoTargets((state) => state.targets);
	const buffer = useGotoMode((state) => state.buffer);
	const activeIds = useGotoMode((state) => state.activeIds);

	return (
		<>
			{Object.values(targets).flatMap((target) =>
				activeIds.has(target.to.id) &&
				target.element !== null &&
				target.element.isConnected &&
				target.keybind.startsWith(buffer)
					? [
							<GotoIndicator
								key={target.to.id}
								target={target}
								element={target.element as HTMLElement}
								settings={settings}
							/>,
						]
					: [],
			)}
		</>
	);
}
