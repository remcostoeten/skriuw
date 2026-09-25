#!/usr/bin/env bun
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Copies @skriuw/storybook-shell into another project.

Usage: bun install.ts <project-root> [--dir src/storybook] [--force | --update]

  --dir     Destination inside the project (default: src/storybook)
  --force   Overwrite every shell file, including local edits
  --update  Replace shell files that are unchanged since the last install; keep edited ones`;

export const SHELL_FILES = [
  "index.ts",
  "icons.tsx",
  "preferences.ts",
  "props-table.tsx",
  "story.tsx",
  "storybook.tsx",
  "toc.tsx",
  "code.tsx",
  "config.ts",
  "jump.ts",
  "shortcut-help.tsx",
  "typography.tsx",
];
export const MANIFEST = ".storybook-shell.json";
const TOKENS = "tokens.css";
const STARTER = "storybook-app.tsx";
const REQUIRED = ["react", "react-dom", "tailwindcss"];
const TAILWIND_INTEGRATIONS = ["@tailwindcss/vite", "@tailwindcss/postcss", "@tailwindcss/cli"];
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  ".git",
  ".next",
  ".turbo",
  ".vercel",
]);

const STARTER_SOURCE = `import { Storybook, Variant, type Story } from "./index";

const stories: Story[] = [
  {
    id: "welcome",
    group: "Getting started",
    title: "Welcome",
    description: "Replace this story with your own components.",
    render: () => (
      <Variant label="Example">
        <button type="button" className="h-8 rounded-md border border-border px-3 text-[13px] hover:bg-muted">
          Button
        </button>
      </Variant>
    ),
  },
];

export function StorybookApp() {
  return (
    <Storybook
      title="__TITLE__"
      stories={stories}
      themes={[
        { id: "dark", label: "Dark", colorScheme: "dark" },
        { id: "light", label: "Light", colorScheme: "light" },
      ]}
    />
  );
}
`;

export type InstallMode = "install" | "force" | "update";

export type InstallOptions = {
  project: string;
  dir?: string;
  mode?: InstallMode;
  sourceDirectory?: string;
  origin?: Origin;
};

export type Origin = { repo?: string; ref?: string; sha?: string };

export type Manifest = Origin & { installedAt: string; files: Record<string, string> };

export type FileOutcome = "written" | "updated" | "unchanged" | "kept-existing" | "kept-edited";

export type InstallResult = {
  target: string;
  files: Record<string, FileOutcome>;
  steps: string[];
};

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function fail(message: string): never {
  throw new Error(message);
}

function hash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function readPackage(project: string): PackageJson {
  const path = join(project, "package.json");
  if (!existsSync(path)) fail(`No package.json in ${project}`);
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

function readManifest(target: string): Manifest | undefined {
  const path = join(target, MANIFEST);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

function copyShellFile(
  source: string,
  destination: string,
  mode: InstallMode,
  recorded: string | undefined,
): FileOutcome {
  const incoming = readFileSync(source);
  if (!existsSync(destination)) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    return "written";
  }
  const current = hash(readFileSync(destination));
  if (current === hash(incoming)) return "unchanged";
  if (mode === "force") {
    copyFileSync(source, destination);
    return "updated";
  }
  if (mode === "update") {
    if (recorded !== current) return "kept-edited";
    copyFileSync(source, destination);
    return "updated";
  }
  return "kept-existing";
}

function keepsLocalContent(outcome: FileOutcome): boolean {
  return outcome === "kept-edited" || outcome === "kept-existing";
}

/** Finds the CSS file that imports Tailwind, searching the whole project except build and dependency folders. */
export function findTailwindEntry(project: string): string | undefined {
  const queue = [project];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) queue.push(join(dir, entry.name));
      } else if (
        entry.name.endsWith(".css") &&
        /@import\s+["']tailwindcss["']/.test(readFileSync(join(dir, entry.name), "utf8"))
      ) {
        return join(dir, entry.name);
      }
    }
  }
  return undefined;
}

/** True when the stylesheet defines the shell's color tokens itself. */
export function definesTokens(css: string): boolean {
  return /--color-background\s*:/.test(css);
}

/** True when the stylesheet already imports the shell's `tokens.css`. */
export function importsTokens(css: string): boolean {
  return /@import\s+["'][^"']*tokens\.css["']/.test(css);
}

function importPath(from: string, to: string): string {
  const path = relative(from, to);
  return path.startsWith(".") ? path : `./${path}`;
}

/** Copies the shell into `project`, records what was installed, and returns the remaining setup steps. */
export function install(options: InstallOptions): InstallResult {
  const project = resolve(options.project);
  const dir = options.dir ?? "src/storybook";
  const mode = options.mode ?? "install";
  const sourceDirectory = options.sourceDirectory ?? dirname(fileURLToPath(import.meta.url));
  const pkg = readPackage(project);
  const target = join(project, dir);
  const previous = readManifest(target);
  if (mode === "update" && !previous)
    fail(`No ${MANIFEST} in ${target}; run a normal install first`);

  const css = findTailwindEntry(project);
  const cssSource = css ? readFileSync(css, "utf8") : "";
  const needsTokens = !definesTokens(cssSource);
  const shellFiles =
    needsTokens || previous?.files[TOKENS] ? [...SHELL_FILES, TOKENS] : SHELL_FILES;

  const files: Record<string, FileOutcome> = {};
  const recorded: Record<string, string> = {};
  for (const file of shellFiles) {
    const destination = join(target, file);
    files[file] = copyShellFile(
      join(sourceDirectory, file),
      destination,
      mode,
      previous?.files[file],
    );
    recorded[file] = keepsLocalContent(files[file])
      ? (previous?.files[file] ?? hash(readFileSync(join(sourceDirectory, file))))
      : hash(readFileSync(destination));
  }

  const starter = join(target, STARTER);
  if (existsSync(starter)) files[STARTER] = "kept-existing";
  else {
    writeFileSync(starter, STARTER_SOURCE.replace("__TITLE__", `${pkg.name ?? "App"} Storybook`));
    files[STARTER] = "written";
  }

  const manifest: Manifest = {
    ...options.origin,
    installedAt: new Date().toISOString(),
    files: recorded,
  };
  writeFileSync(join(target, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);

  const installed = { ...pkg.dependencies, ...pkg.devDependencies };
  const missing = REQUIRED.filter((name) => !(name in installed));
  const steps: string[] = [];
  if (missing.length > 0) steps.push(`Install missing dependencies: bun add ${missing.join(" ")}`);
  if (!TAILWIND_INTEGRATIONS.some((name) => name in installed))
    steps.push(
      `Add a Tailwind v4 integration, for example: bun add -d @tailwindcss/vite (then add tailwindcss() to vite.config)`,
    );
  if (!css) {
    steps.push('Create a CSS entry with @import "tailwindcss";');
    steps.push(
      `Import ${relative(project, join(target, TOKENS))} after it, or define the colors background, foreground, muted, muted-foreground, border and ring`,
    );
  } else {
    const cssName = relative(project, css);
    if (relative(dirname(css), target).startsWith(".."))
      steps.push(`Add to ${cssName}: @source "${relative(dirname(css), target)}";`);
    if (needsTokens && !importsTokens(cssSource))
      steps.push(
        `Add to ${cssName} after the Tailwind import: @import "${importPath(dirname(css), join(target, TOKENS))}";`,
      );
  }
  steps.push(`Render <StorybookApp /> from ${join(dir, STARTER)} on its own route or entry`);
  return { target, files, steps };
}

const OUTCOME_LABEL: Record<FileOutcome, string> = {
  written: "write  ",
  updated: "update ",
  unchanged: "same   ",
  "kept-existing": "skip   ",
  "kept-edited": "edited ",
};

function parseArguments(argv: string[]): InstallOptions {
  const positional: string[] = [];
  let dir: string | undefined;
  let mode: InstallMode = "install";
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--force") mode = "force";
    else if (argument === "--update") mode = "update";
    else if (argument === "--dir") dir = argv[++index] ?? fail("--dir needs a value");
    else if (argument === "-h" || argument === "--help") {
      console.log(USAGE);
      process.exit(0);
    } else positional.push(argument);
  }
  if (positional.length !== 1) fail(USAGE);
  const origin: Origin = {
    repo: process.env.STORYBOOK_SHELL_REPO,
    ref: process.env.STORYBOOK_SHELL_REF,
    sha: process.env.STORYBOOK_SHELL_SHA,
  };
  return { project: positional[0]!, dir, mode, origin };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = install(options);
  console.log(`Storybook shell in ${result.target}`);
  for (const [file, outcome] of Object.entries(result.files))
    console.log(`  ${OUTCOME_LABEL[outcome]}${file}`);
  const edited = Object.entries(result.files).filter(([, outcome]) => outcome === "kept-edited");
  if (edited.length > 0)
    console.log(`\nKept ${edited.length} locally edited file(s); pass --force to overwrite them.`);
  if (options.mode === "install" && Object.values(result.files).includes("kept-existing"))
    console.log("\nExisting files were kept; use --update to refresh unedited ones.");
  console.log("\nNext steps:");
  for (const step of result.steps) console.log(`  - ${step}`);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
