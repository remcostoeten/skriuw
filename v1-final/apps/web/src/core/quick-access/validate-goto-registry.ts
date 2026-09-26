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
		const destinationId = target.to.id;
		if (!target.keybind) {
			issues.push({
				destinationId,
				message: `"${destinationId}" has an empty keybind`,
			});
			continue;
		}
		if (target.keybind.includes("escape")) {
			issues.push({
				destinationId,
				message: `"${destinationId}" may not bind Escape — it always exits go-to mode`,
			});
			continue;
		}
		const existing = byKeybind.get(target.keybind);
		if (existing) {
			issues.push({
				destinationId,
				message: `keybind "${target.keybind}" is bound to both "${existing.to.id}" and "${destinationId}"`,
			});
			continue;
		}
		byKeybind.set(target.keybind, target);
	}

	const keybinds = Array.from(byKeybind.keys());
	const keybindSet = new Set(keybinds);
	const shadowedByPrefix = new Map<string, string>();

	for (const keybind of keybinds) {
		for (let prefixLength = 1; prefixLength < keybind.length; prefixLength += 1) {
			const prefix = keybind.slice(0, prefixLength);
			if (keybindSet.has(prefix) && !shadowedByPrefix.has(prefix)) {
				shadowedByPrefix.set(prefix, keybind);
			}
		}
	}

	const valid: RegisteredGotoTarget[] = [];

	for (const target of byKeybind.values()) {
		const shadowed = shadowedByPrefix.get(target.keybind);
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
