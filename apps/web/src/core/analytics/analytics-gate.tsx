"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { isBraveBrowser, isClientAnalyticsDisabled } from "./config";

const LazyAnalyticsMount = dynamic(
	() => import("./analytics-mount").then((module) => module.AnalyticsMount),
	{
		ssr: false,
		loading: () => null,
	},
);

function scheduleIdleWork(callback: () => void): () => void {
	if (typeof window.requestIdleCallback === "function") {
		const id = window.requestIdleCallback(callback);
		return () => window.cancelIdleCallback(id);
	}

	const id = window.setTimeout(callback, 1500);
	return () => window.clearTimeout(id);
}

export function AnalyticsGate() {
	const [shouldRender, setShouldRender] = useState(false);
	const [browserChecked] = useState(() => typeof window !== "undefined");
	const [braveDetected] = useState(() => typeof window !== "undefined" && isBraveBrowser());

	useEffect(() => {
		if (!browserChecked || braveDetected || isClientAnalyticsDisabled()) {
			return;
		}

		return scheduleIdleWork(() => {
			setShouldRender(true);
		});
	}, [browserChecked, braveDetected]);

	if (!browserChecked || braveDetected || isClientAnalyticsDisabled()) {
		return null;
	}

	if (!shouldRender) {
		return null;
	}

	return <LazyAnalyticsMount />;
}
