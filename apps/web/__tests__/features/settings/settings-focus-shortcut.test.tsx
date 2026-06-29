import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

describe("settings focus shortcut", () => {
	test("detects editable targets so slash can keep typing normally", async () => {
		const { isEditableShortcutTarget } = await import(
			`@/features/settings/lib/focus-shortcut?test=${Math.random().toString(36).slice(2)}`
		);

		expect(isEditableShortcutTarget({ closest: () => ({}) })).toBe(true);
		expect(isEditableShortcutTarget({ closest: () => null })).toBe(false);
		expect(isEditableShortcutTarget(null)).toBe(false);
	});

	test("renders a compact slash hint for the settings main focus shortcut", async () => {
		const { SettingsFocusShortcutHint } = await import(
			`@/features/settings/components/settings-focus-shortcut-hint?test=${Math.random().toString(36).slice(2)}`
		);

		const html = renderToStaticMarkup(<SettingsFocusShortcutHint />);

		expect(html).toContain("<kbd");
		expect(html).toContain(">/</kbd>");
		expect(html).toContain("Focus main");
	});
});
