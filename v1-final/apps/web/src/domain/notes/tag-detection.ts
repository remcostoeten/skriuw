/**
 * Global switch for deriving #tags from plain note text. Tag chips the user
 * inserts explicitly (via the `#` suggestion menu) are data inside richContent
 * and are never affected — this only gates the regex-derived tags that turn
 * things like `#comment` lines in pasted .env/code snippets into workspace
 * tags. Driven by the `editor.detectTagsInText` preference; imports disable
 * detection outright regardless of the preference.
 */

let tagDetectionEnabled = true;

export function isTagDetectionEnabled(): boolean {
	return tagDetectionEnabled;
}

export function setTagDetectionEnabled(enabled: boolean): void {
	tagDetectionEnabled = enabled;
}
