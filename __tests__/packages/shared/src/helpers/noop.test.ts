import { expect, test } from "vitest";
import { noop } from "@skriuw/shared/helpers/noop";

test("noop returns undefined", () => {
  expect(noop()).toBeUndefined();
});
