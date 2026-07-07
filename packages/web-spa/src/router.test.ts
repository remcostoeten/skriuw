import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("desktop router", () => {
	test("registers the trash page route", () => {
		const source = readFileSync(join(here, "router.tsx"), "utf8");

		expect(source).toContain('path: "/app/trash"');
		expect(source).toContain("trashRoute");
	});

	test("registers the activity page route", () => {
		const source = readFileSync(join(here, "router.tsx"), "utf8");

		expect(source).toContain('path: "/app/activity"');
		expect(source).toContain("activityRoute");
	});
});
