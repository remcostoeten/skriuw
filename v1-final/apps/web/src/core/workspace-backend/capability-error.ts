import type { WorkspaceCapabilities } from "./types";

/**
 * Thrown when a workspace backend is asked to perform an operation it does not
 * support — i.e. it advertises the matching `capabilities` flag as `false`
 * (e.g. journal/sharing on the guest `localBackend`). A dedicated type lets
 * callers distinguish "this backend can't do that here" from a genuine runtime
 * failure, and UI can gate on `capabilities` before ever reaching it.
 */
export class WorkspaceCapabilityError extends Error {
	readonly capability: keyof WorkspaceCapabilities;

	constructor(capability: keyof WorkspaceCapabilities) {
		super(`This workspace backend does not support "${capability}".`);
		this.name = "WorkspaceCapabilityError";
		this.capability = capability;
	}
}
