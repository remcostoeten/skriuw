import { describe, expect, it } from "vitest";
import type { CommandPaletteGroup, CommandPaletteItem } from "@/commands/command-palette-model";
import {
  ALL_SCOPE,
  RECENTS_SCOPE,
  consumeScopePrefix,
  cycleScope,
  scopeCounts,
  scopedQuery,
  typedScope,
} from "@/commands/palette-scopes";

function items(count: number): CommandPaletteItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    label: `Item ${index}`,
    action: () => undefined,
  }));
}

describe("palette scopes", () => {
  it("rebuilds the raw query the model parses", () => {
    expect(scopedQuery(ALL_SCOPE, "alpha")).toBe("alpha");
    expect(scopedQuery("n", "alpha")).toBe("!n alpha");
    expect(scopedQuery(RECENTS_SCOPE, "")).toBe("recents ");
  });

  it("names the scope a raw query resolves to", () => {
    expect(typedScope("alpha")).toBe(ALL_SCOPE);
    expect(typedScope("!n")).toBe("n");
    expect(typedScope("!people ann")).toBe("p");
    expect(typedScope("recents")).toBe(RECENTS_SCOPE);
    expect(typedScope("!zz")).toBe(ALL_SCOPE);
  });

  it("consumes a scope prefix only once it is committed with a space", () => {
    expect(consumeScopePrefix("!t")).toBeNull();
    expect(consumeScopePrefix("!t ")).toEqual({ scope: "t", text: "" });
    expect(consumeScopePrefix("!t idea board")).toEqual({ scope: "t", text: "idea board" });
    expect(consumeScopePrefix("recents plan")).toEqual({ scope: RECENTS_SCOPE, text: "plan" });
    expect(consumeScopePrefix("plain text")).toBeNull();
    expect(consumeScopePrefix("!zz text")).toBeNull();
  });

  it("cycles through the tabs and wraps at both ends", () => {
    expect(cycleScope(ALL_SCOPE, 1)).toBe("a");
    expect(cycleScope(ALL_SCOPE, -1)).toBe(RECENTS_SCOPE);
    expect(cycleScope(RECENTS_SCOPE, 1)).toBe(ALL_SCOPE);
    expect(cycleScope("unknown", 1)).toBe("a");
  });

  it("counts results per scope, including rows a capped group hides", () => {
    const groups: CommandPaletteGroup[] = [
      { group: "Actions", items: items(2) },
      { group: "Notes", items: items(3), hiddenCount: 7 },
      { group: "Content", items: items(1) },
      { group: "Navigation", items: items(4) },
    ];
    const counts = scopeCounts(groups, [{ group: "Recent notes", items: items(5) }]);
    expect(counts.get(ALL_SCOPE)).toBe(17);
    expect(counts.get("a")).toBe(6);
    expect(counts.get("n")).toBe(11);
    expect(counts.get("t")).toBe(0);
    expect(counts.get("g")).toBe(4);
    expect(counts.get(RECENTS_SCOPE)).toBe(5);
  });
});
