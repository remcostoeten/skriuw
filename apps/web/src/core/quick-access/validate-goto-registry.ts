import type { RegisteredGotoTarget } from "./goto-types";

export type GotoRegistryIssue = {
	destinationId: string;
	message: string;
};

type ValidationResult = {
	valid: RegisteredGotoTarget[];
	issues: GotoRegistryIssue[];
};

/**
 * Validates the currently mounted go-to targets right before the mode
 * activates: empty or Escape keybinds are rejected, duplicate keybinds keep
 * only the first registration, and ambiguous keybinds (one being a strict
 * prefix of another, e.g. "a" vs "aa") drop the shorter one so the longer
 * sequence stays reachable.
 */
export function validateGotoTargets(targets: RegisteredGotoTarget[]): ValidationResult {
	const issues: GotoRegistryIssue[] = [];
	const byKeybind = new Map<string, RegisteredGotoTarget>();

	for (const target of targets) {
		if (!target.keybind) {
			issues.push({
				destinationId: target.to.id,
				message: `"${target.to.id}" has an empty keybind`,
			});
			continue;
		}
		if (target.keybind.includes("escape")) {
			issues.push({
				destinationId: target.to.id,
				message: `"${target.to.id}" may not bind Escape — it always exits go-to mode`,
			});
			continue;
		}
		const existing = byKeybind.get(target.keybind);
		if (existing) {
			issues.push({
				destinationId: target.to.id,
				message: `keybind "${target.keybind}" is bound to both "${existing.to.id}" and "${target.to.id}"`,
			});
			continue;
		}
		byKeybind.set(target.keybind, target);
	}

	const keybinds = Array.from(byKeybind.keys());
	const valid: RegisteredGotoTarget[] = [];

	for (const target of byKeybind.values()) {
		const shadowed = keybinds.find(
			(other) => other !== target.keybind && other.startsWith(target.keybind),
		);
		if (shadowed) {
			issues.push({
				destinationId: target.to.id,
				message: `keybind "${target.keybind}" is ambiguous — it is a prefix of "${shadowed}"`,
			});
			continue;
		}
		valid.push(target);
	}

	return { valid, issues };
}
