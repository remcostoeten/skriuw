import assert from "node:assert/strict";
import { test } from "vitest";

import { typographyStories } from "../../../packages/storybook-shell/typography";

test("creates one story per non-empty section, in a fixed order", () => {
  const stories = typographyStories({
    styles: [{ name: "Heading", as: "h1" }],
    sizes: [{ name: "Body" }],
    lineHeights: [],
  });
  assert.deepEqual(
    stories.map(({ id, group, title }) => ({ id, group, title })),
    [
      { id: "typography-type-scale", group: "Typography", title: "Type scale" },
      { id: "typography-text-styles", group: "Typography", title: "Text styles" },
    ],
  );
});

test("applies group, id prefix and title overrides", () => {
  const [story] = typographyStories(
    { families: [{ name: "Sans" }] },
    {
      group: "Brand",
      idPrefix: "brand",
      titles: { families: "Typefaces" },
      descriptions: { families: "Ours." },
    },
  );
  assert.equal(story!.id, "brand-fonts");
  assert.equal(story!.group, "Brand");
  assert.equal(story!.title, "Typefaces");
  assert.equal(story!.description, "Ours.");
});
