import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const serverBackendSource = readFileSync(
	resolve(import.meta.dir, "../../../src/core/workspace-backend/server-backend.ts"),
	"utf8",
);

describe("serverBackend", () => {
	test("wires note and folder list readers for client-side navigation after sign-in", () => {
		expect(serverBackendSource).toContain("listNotes");
		expect(serverBackendSource).toContain("listFolders");
	});

	test("wires journal list readers for client-side navigation after sign-in", () => {
		expect(serverBackendSource).toContain("listJournalEntries");
		expect(serverBackendSource).toContain("listJournalTags");
	});
});
