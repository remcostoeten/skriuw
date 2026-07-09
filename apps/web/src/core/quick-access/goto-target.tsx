"use client";

import type { ReactNode } from "react";
import type { GotoDestination } from "./goto-types";
import { useGotoTarget } from "./use-goto-target";

type Props = {
	keybind: string;
	to: GotoDestination;
	label?: string;
	enabled?: boolean;
	className?: string;
	children: ReactNode;
};

/**
 * Declarative wrapper around {@link useGotoTarget} for cases where wrapping
 * the region in an extra element is acceptable. When it isn't, use the hook
 * directly and attach its ref to an existing element.
 */
function GotoTarget({ keybind, to, label, enabled, className, children }: Props) {
	const targetRef = useGotoTarget({ keybind, to, label, enabled });

	return (
		<div ref={targetRef} className={className}>
			{children}
		</div>
	);
}
