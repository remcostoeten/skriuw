export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

/**
 * Validate a username against the rules enforced by the Better Auth username
 * plugin: letters, numbers, underscores, and dots only, between
 * {@link USERNAME_MIN_LENGTH} and {@link USERNAME_MAX_LENGTH} characters.
 *
 * Returns `null` when the value is valid, otherwise a human-readable error
 * message suitable for display next to the input.
 *
 * @example
 * ```ts
 * validateUsernameFormat("ada"); // null
 * validateUsernameFormat("a b"); // "Use letters, numbers, underscores, and dots only."
 * ```
 */
export function validateUsernameFormat(value: string): string | null {
	const trimmed = value.trim();

	if (trimmed.length < USERNAME_MIN_LENGTH) {
		return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
	}

	if (trimmed.length > USERNAME_MAX_LENGTH) {
		return `Username must be at most ${USERNAME_MAX_LENGTH} characters.`;
	}

	if (!USERNAME_PATTERN.test(trimmed)) {
		return "Use letters, numbers, underscores, and dots only.";
	}

	return null;
}
