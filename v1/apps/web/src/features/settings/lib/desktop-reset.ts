export const RESET_PHRASE = "reset skriuw";

export function matchesDesktopResetPhrase(value: string): boolean {
	return value.trim().toLowerCase() === RESET_PHRASE;
}
