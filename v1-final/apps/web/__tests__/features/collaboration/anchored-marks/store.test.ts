import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import {
	AnchoredMarkStore,
	getAnchoredMarkMap,
} from "@/features/collaboration/anchored-marks/store";
import { MarkRendererRegistry } from "@/features/collaboration/anchored-marks/registry";
import {
	commentRenderer,
	COMMENT_MARK_TYPE,
} from "@/features/collaboration/anchored-marks/renderers/comment";
import type { TAnchoredMark, TResolvedMark } from "@/features/collaboration/anchored-marks/types";

function makeMark(id: string, type = COMMENT_MARK_TYPE): TAnchoredMark {
	return {
		id,
		type,
		author: { id: "u1", name: "Ada", color: "#7c3aed" },
		anchor: { start: new Uint8Array([1]), end: new Uint8Array([2]) },
		payload: { body: "hi", replies: [] },
		createdAt: 1000,
		resolved: false,
	};
}

describe("AnchoredMarkStore", () => {
	test("add / get / getAll round-trip", () => {
		const store = new AnchoredMarkStore(getAnchoredMarkMap(new Y.Doc()));
		store.add(makeMark("a"));
		store.add(makeMark("b"));
		expect(store.get("a")?.id).toBe("a");
		expect(
			store
				.getAll()
				.map((m) => m.id)
				.sort(),
		).toEqual(["a", "b"]);
	});

	test("update patches without dropping other fields", () => {
		const store = new AnchoredMarkStore(getAnchoredMarkMap(new Y.Doc()));
		store.add(makeMark("a"));
		store.update("a", { payload: { body: "edited", replies: [] } });
		expect((store.get("a")!.payload as { body: string }).body).toBe("edited");
		expect(store.get("a")?.author.name).toBe("Ada");
	});

	test("resolve flips the flag; remove deletes", () => {
		const store = new AnchoredMarkStore(getAnchoredMarkMap(new Y.Doc()));
		store.add(makeMark("a"));
		store.resolve("a");
		expect(store.get("a")?.resolved).toBe(true);
		store.remove("a");
		expect(store.get("a")).toBeUndefined();
	});

	test("observe fires on change and unsubscribes cleanly", () => {
		const store = new AnchoredMarkStore(getAnchoredMarkMap(new Y.Doc()));
		let hits = 0;
		const off = store.observe(() => {
			hits += 1;
		});
		store.add(makeMark("a"));
		expect(hits).toBe(1);
		off();
		store.add(makeMark("b"));
		expect(hits).toBe(1);
	});

	test("syncs across two docs over a Yjs update", () => {
		const docA = new Y.Doc();
		const docB = new Y.Doc();
		const storeA = new AnchoredMarkStore(getAnchoredMarkMap(docA));
		const storeB = new AnchoredMarkStore(getAnchoredMarkMap(docB));
		storeA.add(makeMark("shared"));
		Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
		expect(storeB.get("shared")?.id).toBe("shared");
	});
});

describe("MarkRendererRegistry", () => {
	const resolved = (mark: TAnchoredMark, from: number, to: number): TResolvedMark => ({
		mark,
		from,
		to,
	});

	test("skips marks with no registered renderer", () => {
		const registry = new MarkRendererRegistry([commentRenderer()]);
		const decos = registry.buildAll([
			resolved(makeMark("a"), 1, 5),
			resolved(makeMark("b", "unknown-type"), 1, 5),
		]);
		expect(decos.length).toBe(1);
	});

	test("drops collapsed (deleted) ranges", () => {
		const registry = new MarkRendererRegistry([commentRenderer()]);
		expect(registry.buildAll([resolved(makeMark("a"), 4, 4)]).length).toBe(0);
	});

	test("has() reports registration", () => {
		const registry = new MarkRendererRegistry([commentRenderer()]);
		expect(registry.has(COMMENT_MARK_TYPE)).toBe(true);
		expect(registry.has("highlight")).toBe(false);
	});
});
