import { describe, expect, test } from "bun:test";
import { seedBundleToSnapshot } from "@/domain/seed/guest-bundle";
import type { ActiveSeedBundle } from "@/domain/seed/queries";

function bundle(payload: Partial<ActiveSeedBundle["payload"]>): ActiveSeedBundle {
	return {
		id: "bundle-1",
		name: "Welcome",
		updatedAt: new Date("2024-06-01T00:00:00Z"),
		payload: {
			folders: payload.folders ?? [],
			notes: payload.notes ?? [],
			tags: payload.tags ?? [],
			journals: payload.journals ?? [],
		},
	};
}

describe("seedBundleToSnapshot", () => {
	test("prefixes refs with the guest namespace", () => {
		const snapshot = seedBundleToSnapshot(
			bundle({
				folders: [{ ref: "root", name: "Root", parentRef: null, order: 0 }],
				notes: [
					{
						ref: "n1",
						name: "Note.md",
						parentRef: null,
						order: 0,
						richContent: [],
						content: "body",
					},
				],
			}),
		);

		expect(snapshot.folders[0]!.id).toBe("guest:root");
		expect(snapshot.notes[0]!.id).toBe("guest:n1");
		expect(snapshot.noteDetails[0]!.id).toBe("guest:n1");
	});

	test("resolves parent refs to prefixed ids", () => {
		const snapshot = seedBundleToSnapshot(
			bundle({
				folders: [{ ref: "root", name: "Root", parentRef: null, order: 0 }],
				notes: [
					{
						ref: "n1",
						name: "Child.md",
						parentRef: "root",
						order: 0,
						richContent: [],
						content: "",
					},
				],
			}),
		);

		expect(snapshot.notes[0]!.parentId).toBe("guest:root");
		expect(snapshot.noteDetails[0]!.parentId).toBe("guest:root");
	});

	test("maps the markdown editor mode to raw", () => {
		const snapshot = seedBundleToSnapshot(
			bundle({
				notes: [
					{
						ref: "n1",
						name: "Raw.md",
						parentRef: null,
						order: 0,
						richContent: [],
						content: "# heading",
						preferredEditorMode: "markdown",
					},
				],
			}),
		);

		expect(snapshot.notes[0]!.preferredEditorMode).toBe("raw");
		expect(snapshot.noteDetails[0]!.preferredEditorMode).toBe("raw");
	});

	test("keeps list notes light while details contain editor content", () => {
		const snapshot = seedBundleToSnapshot(
			bundle({
				notes: [
					{
						ref: "n1",
						name: "Derived.md",
						parentRef: null,
						order: 0,
						richContent: [],
						content: "hello world",
					},
				],
			}),
		);

		expect(snapshot.notes[0]!.content).toBe("");
		expect(snapshot.notes[0]!.richContent).toHaveLength(0);
		expect(snapshot.noteDetails[0]!.content).toBe("hello world");
		expect(snapshot.noteDetails[0]!.richContent.length).toBeGreaterThan(0);
	});

	test("an empty bundle yields an empty snapshot", () => {
		const snapshot = seedBundleToSnapshot(bundle({}));
		expect(snapshot.notes).toHaveLength(0);
		expect(snapshot.noteDetails).toHaveLength(0);
		expect(snapshot.folders).toHaveLength(0);
	});
});
