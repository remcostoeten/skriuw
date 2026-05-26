"use client";

import { MotionConfig } from "framer-motion";
import { usePreferencesStore } from "@/features/settings/store";

export function MotionPreferences({ children }: { children: React.ReactNode }) {
	const reduceMotion = usePreferencesStore((state) => state.appearance.reduceMotion);

	return (
		<MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>{children}</MotionConfig>
	);
}
