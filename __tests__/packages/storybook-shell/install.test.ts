import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "vitest";

import {
  MANIFEST,
  SHELL_FILES,
  findTailwindEntry,
  install,
  providesTokens,
  type Manifest,
} from "../../../packages/storybook-shell/install";

const projects: string[] = [];

type ProjectSetup = { dependencies?: Record<string, string>; css?: Record<string, string> };

function project({
  dependencies = { react: "19", "react-dom": "19", tailwindcss: "4", "@tailwindcss/vite": "4" },
  css = { "src/index.css": '@import "tailwindcss";\n' },
}: ProjectSetup = {}): string {
  const root = mkdtempSync(join(tmpdir(), "storybook-shell-"));
  projects.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "demo", dependencies }));
  for (const [path, content] of Object.entries(css)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function manifest(root: string): Manifest {
  return JSON.parse(readFileSync(join(root, "src/storybook", MANIFEST), "utf8")) as Manifest;
}

afterEach(() => {
  for (const root of projects.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("copies the shell, tokens and starter and records the origin", () => {
  const root = project();
  const result = install({
    project: root,
    origin: { repo: "owner/repo", ref: "main", sha: "abc123" },
  });
  for (const file of [...SHELL_FILES, "tokens.css", "storybook-app.tsx"])
    assert.equal(result.files[file], "written", file);
  const recorded = manifest(root);
  assert.equal(recorded.sha, "abc123");
  assert.deepEqual(Object.keys(recorded.files).sort(), [...SHELL_FILES, "tokens.css"].sort());
  assert.match(
    readFileSync(join(root, "src/storybook/storybook-app.tsx"), "utf8"),
    /title="demo Storybook"/,
  );
  assert.ok(result.steps.some((step) => step.includes('@import "./storybook/tokens.css"')));
});

test("skips tokens when the app defines its own colors", () => {
  const root = project({
    css: { "src/index.css": '@import "tailwindcss";\n@theme { --color-background: white; }\n' },
  });
  const result = install({ project: root });
  assert.equal(result.files["tokens.css"], undefined);
  assert.ok(!existsSync(join(root, "src/storybook/tokens.css")));
  assert.ok(!result.steps.some((step) => step.includes("tokens.css")));
});

test("stops asking for the tokens import once it is added", () => {
  const root = project();
  install({ project: root });
  writeFileSync(
    join(root, "src/index.css"),
    '@import "tailwindcss";\n@import "./storybook/tokens.css";\n',
  );
  const result = install({ project: root, mode: "update" });
  assert.ok(!result.steps.some((step) => step.includes("tokens.css")));
  assert.equal(result.files["tokens.css"], "unchanged");
});

test("a plain rerun keeps existing files", () => {
  const root = project();
  install({ project: root });
  const story = join(root, "src/storybook/story.tsx");
  writeFileSync(story, "edited");
  assert.equal(install({ project: root }).files["story.tsx"], "kept-existing");
  assert.equal(readFileSync(story, "utf8"), "edited");
});

test("update replaces unedited files and keeps edited ones", () => {
  const root = project();
  install({ project: root });
  const edited = join(root, "src/storybook/story.tsx");
  const stale = join(root, "src/storybook/jump.ts");
  writeFileSync(edited, "local edit");
  const recorded = manifest(root);
  writeFileSync(stale, "old release");
  recorded.files["jump.ts"] = createHashOf("old release");
  writeFileSync(join(root, "src/storybook", MANIFEST), JSON.stringify(recorded));

  const result = install({ project: root, mode: "update" });
  assert.equal(result.files["story.tsx"], "kept-edited");
  assert.equal(result.files["jump.ts"], "updated");
  assert.equal(readFileSync(edited, "utf8"), "local edit");
  assert.notEqual(readFileSync(stale, "utf8"), "old release");
  assert.equal(manifest(root).files["story.tsx"], recorded.files["story.tsx"]);
});

test("force overwrites edited files", () => {
  const root = project();
  install({ project: root });
  writeFileSync(join(root, "src/storybook/story.tsx"), "local edit");
  assert.equal(install({ project: root, mode: "force" }).files["story.tsx"], "updated");
});

test("update needs a previous install", () => {
  assert.throws(
    () => install({ project: project(), mode: "update" }),
    /run a normal install first/,
  );
});

test("never overwrites the starter", () => {
  const root = project();
  install({ project: root });
  const starter = join(root, "src/storybook/storybook-app.tsx");
  writeFileSync(starter, "mine");
  assert.equal(
    install({ project: root, mode: "force" }).files["storybook-app.tsx"],
    "kept-existing",
  );
  assert.equal(readFileSync(starter, "utf8"), "mine");
});

test("reports missing dependencies and Tailwind integration", () => {
  const root = project({ dependencies: { react: "19" }, css: {} });
  const steps = install({ project: root }).steps.join("\n");
  assert.match(steps, /bun add react-dom tailwindcss/);
  assert.match(steps, /@tailwindcss\/vite/);
  assert.match(steps, /Create a CSS entry/);
});

test("asks for @source when the CSS entry sits outside the shell's tree", () => {
  const root = project({ css: { "styles/global.css": '@import "tailwindcss";\n' } });
  assert.ok(
    install({ project: root }).steps.some((step) => step.includes('@source "../src/storybook"')),
  );
});

test("finds the Tailwind entry outside src and ignores dependencies", () => {
  const root = project({
    css: {
      "node_modules/pkg/index.css": '@import "tailwindcss";',
      "resources/css/app.css": "@import 'tailwindcss';",
    },
  });
  assert.equal(findTailwindEntry(root), join(root, "resources/css/app.css"));
});

test("recognises token definitions and the tokens import", () => {
  assert.ok(providesTokens("--color-background: red;"));
  assert.ok(providesTokens('@import "./storybook/tokens.css";'));
  assert.ok(!providesTokens('@import "tailwindcss";'));
});

function createHashOf(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
