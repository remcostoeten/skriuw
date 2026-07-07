"use client";

import { useEffect, useState } from "react";
import { Devtool } from "./pulse";

const TRACK_FPS_KEY = "pulse:track-fps";

export function PerfDevtools() {
	const [highlight, setHighlight] = useState(true);
	const [trackFps, setTrackFpsState] = useState(true);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setTrackFpsState(localStorage.getItem(TRACK_FPS_KEY) !== "off");
		setMounted(true);
	}, []);

	function setTrackFps(value: boolean) {
		setTrackFpsState(value);
		localStorage.setItem(TRACK_FPS_KEY, value ? "on" : "off");
	}

	if (!mounted) return null;

	return (
		<Devtool
			highlight={highlight}
			setHighlight={setHighlight}
			trackFps={trackFps}
			setTrackFps={setTrackFps}
		/>
	);
}
