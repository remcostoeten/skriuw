"use client";

import NumberFlow from "@number-flow/react";
import { memo } from "react";
import { usePreferencesStore } from "@/features/settings/store";

type AnimatedNumberProps = {
	value: number;
	className?: string;
};

export const AnimatedNumber = memo(function AnimatedNumber({
	value,
	className,
}: AnimatedNumberProps) {
	const animateNumbers = usePreferencesStore((state) => state.editor.animateNumbers);

	if (!animateNumbers) {
		return <span className={className}>{value}</span>;
	}

	return <NumberFlow value={value} className={className} />;
});
