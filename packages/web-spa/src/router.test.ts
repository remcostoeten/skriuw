import { describe, expect, test } from "bun:test";
import { resolveDesktopRoute } from "./route-contract";

describe("desktop router", () => {
	test("resolves every static workspace route under hash history", () => {
		expect(resolveDesktopRoute("#/app")).toBe("notes");
		expect(resolveDesktopRoute("#/app/graph")).toBe("graph");
		expect(resolveDesktopRoute("#/app/journal")).toBe("journal");
		expect(resolveDesktopRoute("#/app/tasks")).toBe("tasks");
		expect(resolveDesktopRoute("#/app/trash")).toBe("trash");
		expect(resolveDesktopRoute("#/app/activity")).toBe("activity");
		expect(resolveDesktopRoute("#/app/tags")).toBe("tags");
		expect(resolveDesktopRoute("#/app/people")).toBe("people");
	});

	test("resolves dynamic tag and person routes with query strings", () => {
		expect(resolveDesktopRoute("#/app/tags/local-first?panel=notes")).toBe("tag");
		expect(resolveDesktopRoute("/app/people/person-1?tab=mentions")).toBe("person");
	});

	test("rejects unknown and nested routes", () => {
		expect(resolveDesktopRoute("#/app/unknown")).toBeNull();
		expect(resolveDesktopRoute("#/app/trash/nested")).toBeNull();
	});
});
