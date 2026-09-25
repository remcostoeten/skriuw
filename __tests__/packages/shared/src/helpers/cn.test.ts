import { expect, test } from "vitest";
import { cn } from "@skriuw/shared/helpers/cn";

test("joins class names and drops falsy values", () => {
  expect(cn("flex", false, undefined, null, "items-center")).toBe("flex items-center");
});

test("keeps the last of conflicting tailwind utilities", () => {
  expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
});

test("accepts conditional object and array inputs", () => {
  expect(cn(["rounded", { hidden: false, block: true }])).toBe("rounded block");
});
