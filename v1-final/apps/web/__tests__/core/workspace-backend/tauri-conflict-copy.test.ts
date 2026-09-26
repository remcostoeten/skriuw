import { describe, expect, test } from "bun:test";
import {
	buildVaultConflictCopy,
	isVaultConflictError,
} from "@/core/workspace-backend/tauri-backend";
import type { NoteFile } from "@/domain/notes/models";

function note(): NoteFile {
	return {
		id: "source",
		name: "Draft.md",
		content: "exact local body",
		richContent: [{ type: "paragraph", content: "structured" }] as NoteFile["richContent"],
		preferredEditorMode: "block",
		parentId: null,
		sortOrder: 0,
		tags: ["keep"],
		properties: [],
		createdAt: new Date("2026-01-01T00:00:00Z"),
		modifiedAt: new Date("2026-01-01T00:00:00Z"),
	};
}

describe("desktop vault conflict preservation", () => {
	test("recognizes only the typed Rust conflict sentinel", () => {
		expect(isVaultConflictError("VAULT_CONFLICT:source")).toBe(true);
		expect(isVaultConflictError(new Error("VAULT_CONFLICT:source"))).toBe(true);
		expect(isVaultConflictError(new Error("disk failed"))).toBe(false);
	});

	test("copies both body forms exactly under a new identity", () => {
		const source = note();
		const created = new Date("2026-07-18T12:34:56.789Z");
		const copy = buildVaultConflictCopy(source, created, "copy-123456");
		expect(copy.id).toBe("copy-123456");
		expect(copy.name).toContain("Draft — conflict 2026-07-18T12-34-56-789Z copy-1.md");
		expect(copy.content).toBe(source.content);
		expect(copy.richContent).toEqual(source.richContent);
		expect(copy.createdAt).toBe(created);
		expect(copy.modifiedAt).toBe(created);
	});
});
