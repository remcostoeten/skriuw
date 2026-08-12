import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion() {
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		let mounted = true;
		void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
			if (mounted) setReduced(enabled);
		});
		const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
		return () => {
			mounted = false;
			subscription.remove();
		};
	}, []);

	return reduced;
}
