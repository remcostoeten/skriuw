import { describe, expect, it } from "vitest";
import { shareableNote } from "@/features/sharing/share-content";
import { sharingStore } from "./fixtures";

describe("shareableNote", () => {
  it("publishes the note title and Markdown", () => {
    expect(shareableNote(sharingStore().getState(), "open")).toEqual({
      ok: true,
      title: "open title",
      markdown: "open body",
    });
  });

  it("refuses locked notes even while they are unlocked", () => {
    const state = sharingStore().getState();
    expect(shareableNote(state, "locked")).toMatchObject({ ok: false });
    expect(shareableNote(state, "sealed")).toMatchObject({ ok: false });
  });

  it("refuses a note that does not exist", () => {
    expect(shareableNote(sharingStore().getState(), "missing")).toMatchObject({ ok: false });
  });
});
