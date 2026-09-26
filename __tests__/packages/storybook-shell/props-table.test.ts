import assert from "node:assert/strict";
import { test } from "vitest";

import { parseProps } from "../../../packages/storybook-shell/props-table";

test("reads required and optional members with their JSDoc", () => {
  const source = `type ButtonProps = {
  /** Visual weight. */
  tone?: "quiet" | "loud";
  onPress: () => void;
};`;
  const { rows, inherits } = parseProps(source, "ButtonProps");
  assert.deepEqual(inherits, []);
  assert.deepEqual(
    rows.map(({ name, type, required, description }) => ({ name, type, required, description })),
    [
      { name: "tone", type: '"quiet" | "loud"', required: false, description: "Visual weight." },
      { name: "onPress", type: "() => void", required: true, description: undefined },
    ],
  );
});

test("keeps nested object types inside one member", () => {
  const source = `type Props = { layout: { width: number; height: number }; label: string };`;
  const { rows } = parseProps(source, "Props");
  assert.deepEqual(
    rows.map((row) => row.name),
    ["layout", "label"],
  );
  assert.equal(rows[0]!.type, "{ width: number; height: number }");
});

test("lists intersected types as inherited", () => {
  const source = `type Props = ComponentProps<"button"> & { size?: number };`;
  const { rows, inherits } = parseProps(source, "Props");
  assert.deepEqual(inherits, ['ComponentProps<"button">']);
  assert.deepEqual(
    rows.map((row) => row.name),
    ["size"],
  );
});

test("reads defaults from destructured parameters", () => {
  const source = `type Props = { size?: "sm" | "md" };
export function Button({ size = "md" }: Props) {}`;
  assert.equal(parseProps(source, "Props").rows[0]!.defaultValue, '"md"');
});

test("returns nothing for a missing type", () => {
  assert.deepEqual(parseProps("type Other = { a: string };", "Props"), { rows: [], inherits: [] });
});

test("stops at the next statement when the type has no trailing semicolon", () => {
  const source = `type Props = { label: string }
export function Badge({ label }: Props) { return label; }`;
  assert.deepEqual(
    parseProps(source, "Props").rows.map((row) => row.name),
    ["label"],
  );
});

test("terminates when the type runs to the end of the file", () => {
  assert.deepEqual(
    parseProps("type Props = { label: string }", "Props").rows.map((row) => row.name),
    ["label"],
  );
});
