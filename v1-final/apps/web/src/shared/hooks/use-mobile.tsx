"use client";
import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribeMobile(callback: () => void) {
	const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
	mql.addEventListener("change", callback);
	return () => mql.removeEventListener("change", callback);
}

function getMobileSnapshot() {
	return window.innerWidth < MOBILE_BREAKPOINT;
}

function getMobileServerSnapshot() {
	return false;
}

export function useIsMobile() {
	return React.useSyncExternalStore(subscribeMobile, getMobileSnapshot, getMobileServerSnapshot);
}
