export default {
	routes: ["/app", "/app/journal", "/app/settings"],
	clsThreshold: 2,
	diffThreshold: 0.05,
	viewports: [
		{ width: 1280, height: 720, name: "desktop" },
	],
	landmarks: [
		"body",
		"aside",
		"main",
		"[aria-label='Settings sections']",
		"[aria-label='Note inspector']",
	],
	settleTime: 1000,
};
