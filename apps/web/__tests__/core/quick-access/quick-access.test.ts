import { describe, expect, test } from "bun:test";
import {
	MAX_GOTO_DURATION_MS,
	MIN_GOTO_DURATION_MS,
	parseDurationMs,
} from "@/core/quick-access/parse-duration";
import {
	comboHasModifier,
	matchKeySequence,
	normalizeKeybind,
} from "@/core/quick-access/key-sequence";
import { validateGotoTargets } from "@/core/quick-access/validate-goto-registry";
import type { RegisteredGotoTarget } from "@/core/quick-access/goto-types";

function target(id: string, keybind: string): RegisteredGotoTarget {
	return {
		keybind,
		to: { id, type: "route", label: id, path: `/${id}` },
		label: id,
		element: null,
	};
}

describe("parseDurationMs", () => {
	test("parses seconds and milliseconds", () => {
		expect(parseDurationMs("2s")).toBe(2000);
		expect(parseDurationMs("2000ms")).toBe(2000);
		expect(parseDurationMs("0.2s")).toBe(200);
		expect(parseDurationMs("1.5s")).toBe(1500);
		expect(parseDurationMs("500")).toBe(500);
	});

	test("rejects invalid and out-of-range values", () => {
		expect(parseDurationMs("")).toBeNull();
		expect(parseDurationMs("abc")).toBeNull();
		expect(parseDurationMs("-2s")).toBeNull();
		expect(parseDurationMs("2h")).toBeNull();
		expect(parseDurationMs(`${MIN_GOTO_DURATION_MS - 1}ms`)).toBeNull();
		expect(parseDurationMs(`${MAX_GOTO_DURATION_MS + 1}ms`)).toBeNull();
	});
});

describe("matchKeySequence", () => {
	test("classifies exact, prefix, and none", () => {
		expect(matchKeySequence("aa", "aa")).toBe("exact");
		expect(matchKeySequence("a", "aa")).toBe("prefix");
		expect(matchKeySequence("b", "aa")).toBe("none");
	});
});

describe("normalizeKeybind", () => {
	test("lowercases and trims", () => {
		expect(normalizeKeybind(" R ")).toBe("r");
	});
});

describe("comboHasModifier", () => {
	test("requires mod, ctrl, or alt — shift alone is typing", () => {
		expect(comboHasModifier("mod+g")).toBe(true);
		expect(comboHasModifier("ctrl+shift+i")).toBe(true);
		expect(comboHasModifier("alt+x")).toBe(true);
		expect(comboHasModifier("g")).toBe(false);
		expect(comboHasModifier("shift+g")).toBe(false);
	});
});

describe("validateGotoTargets", () => {
	test("accepts a unique unambiguous set", () => {
		const { valid, issues } = validateGotoTargets([
			target("route.a", "aa"),
			target("route.b", "ab"),
			target("route.c", "r"),
		]);
		expect(issues).toHaveLength(0);
		expect(valid).toHaveLength(3);
	});

	test("drops duplicate keybinds, keeping the first", () => {
		const { valid, issues } = validateGotoTargets([
			target("route.a", "r"),
			target("route.b", "r"),
		]);
		expect(valid.map((t) => t.to.id)).toEqual(["route.a"]);
		expect(issues).toHaveLength(1);
	});

	test("drops ambiguous prefix keybinds, keeping the longer sequence", () => {
		const { valid, issues } = validateGotoTargets([
			target("route.a", "a"),
			target("route.b", "aa"),
		]);
		expect(valid.map((t) => t.to.id)).toEqual(["route.b"]);
		expect(issues).toHaveLength(1);
	});

	test("rejects empty and escape keybinds", () => {
		const { valid, issues } = validateGotoTargets([
			target("route.a", ""),
			target("route.b", "escape"),
		]);
		expect(valid).toHaveLength(0);
		expect(issues).toHaveLength(2);
	});
});
