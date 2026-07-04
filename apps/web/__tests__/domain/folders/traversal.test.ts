import { describe, expect, test } from "bun:test";
import {
	collectFolderSubtreeIds,
	indexFoldersByParentId,
	type FolderTreeNode,
} from "@/domain/folders/traversal";

function childrenAccessor(folders: FolderTreeNode[]) {
	const index = indexFoldersByParentId(folders);
	return (parentId: string) => index.get(parentId) ?? [];
}

describe("collectFolderSubtreeIds", () => {
	const tree: FolderTreeNode[] = [
		{ id: "root", parentId: null },
		{ id: "a", parentId: "root" },
		{ id: "b", parentId: "root" },
		{ id: "a1", parentId: "a" },
		{ id: "a2", parentId: "a" },
		{ id: "a1x", parentId: "a1" },
		{ id: "other", parentId: null },
	];

	test("includes the root and every descendant", () => {
		const ids = collectFolderSubtreeIds("root", childrenAccessor(tree));
		expect([...ids].sort()).toEqual(["a", "a1", "a1x", "a2", "b", "root"]);
	});

	test("collects a mid-tree subtree without unrelated branches", () => {
		const ids = collectFolderSubtreeIds("a", childrenAccessor(tree));
		expect([...ids].sort()).toEqual(["a", "a1", "a1x", "a2"]);
		expect(ids.has("b")).toBe(false);
		expect(ids.has("other")).toBe(false);
	});

	test("a leaf resolves to just itself", () => {
		const ids = collectFolderSubtreeIds("a1x", childrenAccessor(tree));
		expect([...ids]).toEqual(["a1x"]);
	});

	test("terminates on a corrupt parentId cycle instead of looping forever", () => {
		// x → y → x is a cycle; an unguarded walk would recurse forever.
		const cyclic: FolderTreeNode[] = [
			{ id: "x", parentId: "y" },
			{ id: "y", parentId: "x" },
			{ id: "z", parentId: "y" },
		];
		const ids = collectFolderSubtreeIds("x", childrenAccessor(cyclic));
		expect([...ids].sort()).toEqual(["x", "y", "z"]);
	});

	test("a folder that is its own parent still terminates", () => {
		const selfLoop: FolderTreeNode[] = [{ id: "s", parentId: "s" }];
		const ids = collectFolderSubtreeIds("s", childrenAccessor(selfLoop));
		expect([...ids]).toEqual(["s"]);
	});
});
