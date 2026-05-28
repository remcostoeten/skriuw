"use client";

import { formatDistanceToNow } from "date-fns";
import { memo, useMemo } from "react";
import { parseRelativeDistanceLabel } from "@/shared/lib/parse-relative-distance-label";
import { cn } from "@/shared/lib/utils";
import { AnimatedNumber } from "@/shared/ui/animated-number";

type Props = {
	date: Date | number;
	animate?: boolean;
	className?: string;
	suffix?: string;
};

export const AnimatedRelativeTime = memo(function AnimatedRelativeTime({
	date,
	animate = true,
	className,
	suffix,
}: Props) {
	const parts = useMemo(() => {
		const label = formatDistanceToNow(date, { addSuffix: false });
		return parseRelativeDistanceLabel(label);
	}, [date]);

	if (parts.kind === "text") {
		return (
			<span className={cn("tabular-nums", className)}>
				{parts.label}
				{suffix}
			</span>
		);
	}

	return (
		<span className={cn("inline-flex items-baseline tabular-nums", className)}>
			{parts.prefix}
			<AnimatedNumber value={parts.value} animate={animate} />
			<span> {parts.unit}</span>
			{suffix}
		</span>
	);
});
