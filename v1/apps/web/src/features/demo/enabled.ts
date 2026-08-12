/**
 * Demo stages mount the editor with fake data and no auth, so they stay behind
 * an explicit opt-in. They are gated on a flag rather than `NODE_ENV` because
 * the recordings are made against a production build (dev-mode compilation
 * stutter shows up in the capture).
 */
export function areDemoRoutesEnabled(): boolean {
	return process.env.NEXT_PUBLIC_ENABLE_DEMO_ROUTES === "true";
}
