/**
 * Global switch for auto-detecting living-information marks (amounts, dates,
 * counts, states, links) from plain note text as it is typed. Marks the user
 * creates explicitly via the highlight menu are data inside richContent and are
 * never affected — this only gates the live conversion driven by the
 * `editor.detectMarksInText` preference. Mirrored into a module-level flag so
 * the ProseMirror plugin can read it without threading React context through.
 */

// Explicit marking is the safe default. Automatic conversion creates atomic
// inline nodes, so users opt in after learning how Marks behave.
let markDetectionEnabled = false;

export function isMarkDetectionEnabled(): boolean {
	return markDetectionEnabled;
}

export function setMarkDetectionEnabled(enabled: boolean): void {
	markDetectionEnabled = enabled;
}
