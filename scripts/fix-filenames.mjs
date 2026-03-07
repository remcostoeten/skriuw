#!/usr/bin/env node

import {
  existsSync,
  mkdtempSync,
  readFileSync as readFileSyncRaw,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const ROOT_DIR = process.cwd();
const SRC_DIR = join(ROOT_DIR, "src");
const TEMP_DIR_PREFIX = join(ROOT_DIR, ".fix-filenames-");
const MANIFEST_PATH = join(ROOT_DIR, ".fix-filenames-manifest.json");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const args = new Set(process.argv.slice(2));
const requestedDryRun = args.has("--dry-run") || args.has("--check");
const shouldFix = args.has("--fix") || args.has("--write");
const shouldRevert = args.has("--revert");
const shouldDryRun = requestedDryRun || (!shouldFix && !shouldRevert);
const shouldVerbose = args.has("--verbose");

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: node scripts/fix-filenames.mjs [--dry-run] [--fix] [--revert] [--verbose]

Renames all project .ts/.tsx files to kebab-case and updates local import specifiers.

Options:
  --dry-run, --check  Preview renames and import updates without writing files
  --fix, --write   Apply the rename and import updates
  --revert         Revert the last applied run from the saved manifest
  --verbose        Print unchanged files that were inspected
  --help, -h       Show this help text
`);
  process.exit(0);
}

const selectedModes = [requestedDryRun, shouldFix, shouldRevert].filter(Boolean).length;

if (selectedModes > 1) {
  console.error("Choose one mode: --dry-run, --fix, or --revert.");
  process.exit(1);
}

function toPosixPath(value) {
  return value.split(sep).join("/");
}

function toRelativeProjectPath(filePath) {
  return toPosixPath(relative(ROOT_DIR, filePath));
}

function isDeclarationFile(filePath) {
  return filePath.endsWith(".d.ts");
}

function isSupportedSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(extname(filePath)) && !isDeclarationFile(filePath);
}

function isDynamicRouteSegment(baseName) {
  return /^\[.*\]$/.test(baseName);
}

function toKebabCase(baseName) {
  return baseName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function isKebabCaseBase(baseName) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(baseName);
}

function walkSourceFiles(directory) {
  const discovered = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        discovered.push(...walkSourceFiles(fullPath));
      }
      continue;
    }

    if (entry.isFile() && isSupportedSourceFile(fullPath)) {
      discovered.push(fullPath);
    }
  }

  return discovered;
}

function getPlannedPath(filePath) {
  const extension = extname(filePath);
  const baseName = filePath.slice(0, -extension.length).split(sep).pop();

  if (!baseName || isDynamicRouteSegment(baseName) || isKebabCaseBase(baseName)) {
    return filePath;
  }

  const kebabBaseName = toKebabCase(baseName);
  return join(dirname(filePath), `${kebabBaseName}${extension}`);
}

function ensureNoRenameConflicts(renameMap, fileSet) {
  const claimedTargets = new Map();

  for (const [oldPath, newPath] of renameMap) {
    const normalizedTarget = resolve(newPath);
    const existingOwner = claimedTargets.get(normalizedTarget);
    if (existingOwner) {
      throw new Error(
        `Rename collision: ${toPosixPath(relative(ROOT_DIR, existingOwner))} and ${toPosixPath(relative(ROOT_DIR, oldPath))} both map to ${toPosixPath(relative(ROOT_DIR, normalizedTarget))}`,
      );
    }

    if (existsSync(normalizedTarget) && !fileSet.has(normalizedTarget)) {
      throw new Error(
        `Rename target already exists: ${toPosixPath(relative(ROOT_DIR, normalizedTarget))}`,
      );
    }

    claimedTargets.set(normalizedTarget, oldPath);
  }
}

function resolveImportTarget(fromFilePath, specifier, fileSet) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return null;
  }

  const basePath = specifier.startsWith("@/")
    ? join(SRC_DIR, specifier.slice(2))
    : resolve(dirname(fromFilePath), specifier);

  const candidates = [];
  const extension = extname(basePath);

  if (SOURCE_EXTENSIONS.has(extension)) {
    candidates.push(basePath);
  } else {
    candidates.push(`${basePath}.ts`, `${basePath}.tsx`, join(basePath, "index.ts"), join(basePath, "index.tsx"));
  }

  for (const candidate of candidates) {
    if (fileSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function normalizeSpecifierStyle(originalSpecifier, nextSpecifierPath) {
  const hadExplicitExtension = /\.[mc]?[jt]sx?$/.test(originalSpecifier);
  const hadExplicitIndex = /(?:^|\/)index(?:\.[mc]?[jt]sx?)?$/.test(originalSpecifier);
  let normalized = nextSpecifierPath;

  if (!hadExplicitExtension) {
    normalized = normalized.replace(/\.(?:ts|tsx)$/, "");
  }

  if (!hadExplicitIndex) {
    if (normalized === "./index") {
      normalized = ".";
    } else if (normalized.endsWith("/index")) {
      normalized = normalized.slice(0, -"/index".length);
    }
  }

  return normalized;
}

function buildUpdatedSpecifier(originalSpecifier, fromFilePath, targetFilePath) {
  if (originalSpecifier.startsWith("@/")) {
    const aliasPath = `@/${toPosixPath(relative(SRC_DIR, targetFilePath))}`;
    return normalizeSpecifierStyle(originalSpecifier, aliasPath);
  }

  let relativePath = toPosixPath(relative(dirname(fromFilePath), targetFilePath));
  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }

  return normalizeSpecifierStyle(originalSpecifier, relativePath);
}

function collectModuleSpecifiers(sourceFile) {
  const specifiers = [];

  function addSpecifier(literal) {
    specifiers.push({
      start: literal.getStart(sourceFile) + 1,
      end: literal.getEnd() - 1,
      value: literal.text,
    });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      addSpecifier(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      addSpecifier(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      addSpecifier(node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers.sort((left, right) => right.start - left.start);
}

function rewriteSpecifiers(filePath, nextFilePath, fileSet, renameMap) {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const edits = [];

  for (const specifier of collectModuleSpecifiers(sourceFile)) {
    const resolvedTarget = resolveImportTarget(filePath, specifier.value, fileSet);
    if (!resolvedTarget) {
      continue;
    }

    const nextTargetPath = renameMap.get(resolvedTarget) ?? resolvedTarget;
    const updatedSpecifier = buildUpdatedSpecifier(specifier.value, nextFilePath, nextTargetPath);

    if (updatedSpecifier !== specifier.value) {
      edits.push({ ...specifier, replacement: updatedSpecifier });
    }
  }

  if (edits.length === 0) {
    return { changed: false, content: source, edits };
  }

  let updatedSource = source;
  for (const edit of edits) {
    updatedSource =
      updatedSource.slice(0, edit.start) + edit.replacement + updatedSource.slice(edit.end);
  }

  return { changed: true, content: updatedSource, edits };
}

function applyRenames(renameMap) {
  const tempDirectory = mkdtempSync(TEMP_DIR_PREFIX);
  const staged = [];
  let index = 0;

  try {
    for (const [oldPath, newPath] of renameMap) {
      const tempPath = join(tempDirectory, `${String(index).padStart(4, "0")}${extname(newPath)}`);
      renameSync(oldPath, tempPath);
      staged.push([tempPath, newPath]);
      index += 1;
    }

    for (const [tempPath, newPath] of staged) {
      renameSync(tempPath, newPath);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function writeManifest(manifest) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(
      `No manifest found at ${toRelativeProjectPath(MANIFEST_PATH)}. Run with --fix before using --revert.`,
    );
  }

  return JSON.parse(readFileSyncRaw(MANIFEST_PATH, "utf8"));
}

function revertFromManifest() {
  const manifest = readManifest();
  const restoreEntries = [...manifest.rewrites].sort((left, right) =>
    left.currentPath.localeCompare(right.currentPath),
  );

  for (const entry of restoreEntries) {
    const currentPath = resolve(ROOT_DIR, entry.currentPath);
    if (!existsSync(currentPath)) {
      throw new Error(`Cannot restore missing file: ${entry.currentPath}`);
    }
    writeFileSync(currentPath, entry.previousContent, "utf8");
  }

  const revertRenameMap = new Map(
    manifest.renames.map((entry) => [
      resolve(ROOT_DIR, entry.currentPath),
      resolve(ROOT_DIR, entry.previousPath),
    ]),
  );

  if (revertRenameMap.size > 0) {
    applyRenames(revertRenameMap);
  }

  unlinkSync(MANIFEST_PATH);

  console.log(
    `Reverted ${manifest.renames.length} rename${manifest.renames.length === 1 ? "" : "s"} and restored ${manifest.rewrites.length} file${manifest.rewrites.length === 1 ? "" : "s"}.`,
  );
}

if (shouldRevert) {
  revertFromManifest();
  process.exit(0);
}

const sourceFiles = walkSourceFiles(ROOT_DIR).sort();
const fileSet = new Set(sourceFiles.map((filePath) => resolve(filePath)));
const renameMap = new Map();

for (const filePath of sourceFiles) {
  const nextPath = getPlannedPath(filePath);
  if (nextPath !== filePath) {
    renameMap.set(resolve(filePath), resolve(nextPath));
  } else if (shouldVerbose) {
    console.log(`Checked: ${toPosixPath(relative(ROOT_DIR, filePath))}`);
  }
}

ensureNoRenameConflicts(renameMap, fileSet);

const rewrites = [];
for (const filePath of sourceFiles) {
  const absoluteFilePath = resolve(filePath);
  const nextFilePath = renameMap.get(absoluteFilePath) ?? absoluteFilePath;
  const rewrite = rewriteSpecifiers(absoluteFilePath, nextFilePath, fileSet, renameMap);
  if (rewrite.changed) {
    rewrites.push({
      oldPath: absoluteFilePath,
      nextPath: nextFilePath,
      content: rewrite.content,
      editCount: rewrite.edits.length,
    });
  }
}

if (renameMap.size === 0 && rewrites.length === 0) {
  console.log("All .ts/.tsx filenames are already kebab-case. No import updates needed.");
  process.exit(0);
}

console.log("Planned file renames:");
for (const [oldPath, newPath] of [...renameMap.entries()].sort((left, right) =>
  left[0].localeCompare(right[0]),
)) {
  console.log(
    `  ${toPosixPath(relative(ROOT_DIR, oldPath))} -> ${toPosixPath(relative(ROOT_DIR, newPath))}`,
  );
}

if (rewrites.length > 0) {
  console.log("\nPlanned import updates:");
  for (const rewrite of rewrites.sort((left, right) => left.oldPath.localeCompare(right.oldPath))) {
    const displayedPath = rewrite.nextPath;
    console.log(
      `  ${toPosixPath(relative(ROOT_DIR, displayedPath))} (${rewrite.editCount} specifier${rewrite.editCount === 1 ? "" : "s"})`,
    );
  }
}

if (shouldDryRun) {
  console.log("\nRun with --fix to apply these changes.");
  process.exit(1);
}

if (existsSync(MANIFEST_PATH)) {
  throw new Error(
    `Existing manifest found at ${toRelativeProjectPath(MANIFEST_PATH)}. Revert it with --revert or remove it before applying a new run.`,
  );
}

const manifest = {
  version: 1,
  createdAt: new Date().toISOString(),
  renames: [...renameMap.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([oldPath, newPath]) => ({
      previousPath: toRelativeProjectPath(oldPath),
      currentPath: toRelativeProjectPath(newPath),
    })),
  rewrites: rewrites
    .slice()
    .sort((left, right) => left.oldPath.localeCompare(right.oldPath))
    .map((rewrite) => ({
      previousPath: toRelativeProjectPath(rewrite.oldPath),
      currentPath: toRelativeProjectPath(rewrite.nextPath),
      previousContent: readFileSync(rewrite.oldPath, "utf8"),
    })),
};

applyRenames(renameMap);

for (const rewrite of rewrites) {
  writeFileSync(rewrite.nextPath, rewrite.content, "utf8");
}

writeManifest(manifest);

console.log(
  `\nApplied ${renameMap.size} rename${renameMap.size === 1 ? "" : "s"} and updated ${rewrites.length} file${rewrites.length === 1 ? "" : "s"}. Revert data saved to ${toRelativeProjectPath(MANIFEST_PATH)}.`,
);
