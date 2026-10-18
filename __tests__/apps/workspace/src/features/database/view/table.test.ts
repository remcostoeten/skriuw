import assert from "node:assert/strict";
import { test } from "vitest";
import { headerSorts } from "@/features/database/view/table";

test("clicking a header cycles its sort from ascending to descending to off", () => {
  const ascending = headerSorts([], "title");
  assert.deepEqual(ascending, [{ column: "title", direction: "asc" }]);
  const descending = headerSorts(ascending, "title");
  assert.deepEqual(descending, [{ column: "title", direction: "desc" }]);
  assert.deepEqual(headerSorts(descending, "title"), []);
});

test("clicking another header replaces the sorts with that column", () => {
  const sorts = [
    { column: "title", direction: "desc" as const },
    { column: "p:status", direction: "asc" as const },
  ];
  assert.deepEqual(headerSorts(sorts, "p:priority"), [{ column: "p:priority", direction: "asc" }]);
});
