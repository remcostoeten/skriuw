"use client";

import NumberFlow from "@number-flow/react";
import { memo } from "react";

type Props = {
	value: number;
	className?: string;
	animate?: boolean;
};

export const AnimatedNumber = memo(function AnimatedNumberComponent({
	value,
	className,
	animate = true,
}: Props) {
	if (!animate) {
		return <span className={className}>{value}</span>;
	}

	return <NumberFlow value={value} className={className} />;
});
