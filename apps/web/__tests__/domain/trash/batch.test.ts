import { describe, expect, test } from "bun:test";
import {
	folderBatchId,
	noteBatchId,
	parseBatchId,
	resolveBatchMembers,
	rootDeletedFolders,
} from "@/domain/trash/batch";

const folders = [
	{ id: "root", name: "Root", parentId: null },
	{ id: "child", name: "Child", parentId: "root" },
	{ id: "grandchild", name: "Grandchild", parentId: "child" },
	{ id: "other", name: "Other", parentId: null },
];
const notes = [
	{ id: "n1", name: "In root", parentId: "root" },
	{ id: "n2", name: "In grandchild", parentId: "grandchild" },
	{ id: "n3", name: "Standalone", parentId: "active-folder" },
	{ id: "n4", name: "In other", parentId: "other" },
];

describe("trash batch helpers", () => {
	test("parseBatchId round-trips kind + id", () => {
		expect(parseBatchId(noteBatchId("abc"))).toEqual({ kind: "note", id: "abc" });
		expect(parseBatchId(folderBatchId("xyz"))).toEqual({ kind: "folder", id: "xyz" });
		expect(parseBatchId("garbage")).toBeNull();
		expect(parseBatchId("note:")).toBeNull();
	});

	test("rootDeletedFolders returns only subtree roots", () => {
		expect(
			rootDeletedFolders(folders)
				.map((folder) => folder.id)
				.sort(),
		).toEqual(["other", "root"]);
	});

	test("folder batch resolves the full deleted subtree and its notes", () => {
		const members = resolveBatchMembers(folders, notes, folderBatchId("root"));
		expect(members.folderIds.sort()).toEqual(["child", "grandchild", "root"]);
		expect(members.noteIds.sort()).toEqual(["n1", "n2"]);
	});

	test("note batch resolves only that note", () => {
		const members = resolveBatchMembers(folders, notes, noteBatchId("n3"));
		expect(members).toEqual({ folderIds: [], noteIds: ["n3"] });
	});

	test("unknown batch ids resolve to nothing", () => {
		expect(resolveBatchMembers(folders, notes, folderBatchId("missing"))).toEqual({
			folderIds: [],
			noteIds: [],
		});
		expect(resolveBatchMembers(folders, notes, "bad")).toEqual({ folderIds: [], noteIds: [] });
	});
});
