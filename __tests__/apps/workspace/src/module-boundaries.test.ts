import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative } from "node:path";
import { expect, test } from "vitest";

import { repositoryPath } from "../../../support/paths.ts";

type Layer =
  | "app"
  | "shell"
  | "feature"
  | "commands"
  | "store"
  | "platform"
  | "shared"
  | "contracts";
type ImportKind = "value" | "type" | "dynamic";
type ModuleInfo = { name: string; layer: Layer; root: string };
type Dependency = { from: string; to: string; kind: ImportKind };
type Graph = Map<string, Set<string>>;

const sourceDirectory = repositoryPath("apps/workspace/src");
const baselineFile = "./module-boundaries.baseline.txt";
const baselinePath = repositoryPath("__tests__/apps/workspace/src/module-boundaries.baseline.txt");

const allowedLayers: Record<Layer, readonly Layer[]> = {
  app: ["app", "shell", "feature", "commands", "store", "platform", "shared", "contracts"],
  shell: ["shell", "feature", "commands", "store", "platform", "shared", "contracts"],
  feature: ["feature", "commands", "store", "platform", "shared", "contracts"],
  commands: ["commands", "store", "platform", "shared", "contracts"],
  store: ["store", "platform", "shared", "contracts"],
  platform: ["platform", "shared", "contracts"],
  shared: ["shared", "contracts"],
  contracts: ["contracts"],
};

const singleFolderLayers: Record<string, Layer> = {
  app: "app",
  shell: "shell",
  commands: "commands",
  store: "store",
  contracts: "contracts",
};

const folderModuleLayers: Record<string, Layer> = {
  features: "feature",
  platform: "platform",
  shared: "shared",
};

const sourceExtensions = [".ts", ".tsx"];
const staticImportPattern =
  /^[ \t]*(?:import|export)[ \t]+(type[ \t]+)?[^;()=]*?[\s}*]from[ \t]*["']([^"']+)["']/gm;
const sideEffectImportPattern = /^[ \t]*import[ \t]*["']([^"']+)["']/gm;
const dynamicImportPattern = /(typeof\s+)?\bimport\(\s*["']([^"']+)["']\s*\)/g;
const workerUrlPattern = /new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    const isSource = sourceExtensions.some((extension) => entry.name.endsWith(extension));
    return isSource && !entry.name.endsWith(".d.ts") ? [relative(sourceDirectory, path)] : [];
  });
}

function moduleOf(file: string): ModuleInfo {
  const [top = "", second = ""] = file.split("/");
  const isNested = file.includes("/");
  const folderLayer = folderModuleLayers[top];
  if (isNested && folderLayer !== undefined) {
    return { name: `${top}/${second}`, layer: folderLayer, root: `${top}/${second}` };
  }
  const layer = singleFolderLayers[top];
  if (isNested && layer !== undefined) return { name: top, layer, root: top };
  return { name: "app", layer: "app", root: "" };
}

function isPublicFile(file: string, owner: ModuleInfo): boolean {
  if (owner.layer === "app") return true;
  return !posix.relative(owner.root, file).includes("/");
}

function resolveSpecifier(
  importer: string,
  specifier: string,
  sources: ReadonlySet<string>,
): string | undefined {
  const bare = specifier.split("?")[0] ?? specifier;
  let base: string;
  if (bare.startsWith("@/")) base = bare.slice(2);
  else if (bare.startsWith(".")) base = posix.join(posix.dirname(importer), bare);
  else return undefined;
  const normalized = posix.normalize(base);
  const candidates = [
    normalized,
    ...sourceExtensions.map((extension) => `${normalized}${extension}`),
    ...sourceExtensions.map((extension) => `${normalized}/index${extension}`),
  ];
  return candidates.find((candidate) => sources.has(candidate));
}

function readDependencies(file: string, sources: ReadonlySet<string>): Dependency[] {
  const text = readFileSync(join(sourceDirectory, file), "utf8");
  const found: { specifier: string; kind: ImportKind }[] = [];
  for (const match of text.matchAll(staticImportPattern)) {
    found.push({ specifier: match[2] ?? "", kind: match[1] === undefined ? "value" : "type" });
  }
  for (const match of text.matchAll(sideEffectImportPattern)) {
    found.push({ specifier: match[1] ?? "", kind: "value" });
  }
  for (const match of text.matchAll(dynamicImportPattern)) {
    found.push({ specifier: match[2] ?? "", kind: match[1] === undefined ? "dynamic" : "type" });
  }
  for (const match of text.matchAll(workerUrlPattern)) {
    found.push({ specifier: match[1] ?? "", kind: "dynamic" });
  }
  return found.flatMap(({ specifier, kind }) => {
    const target = resolveSpecifier(file, specifier, sources);
    return target === undefined || target === file ? [] : [{ from: file, to: target, kind }];
  });
}

function addEdge(graph: Graph, from: string, to: string): void {
  const targets = graph.get(from) ?? new Set<string>();
  targets.add(to);
  graph.set(from, targets);
}

function stronglyConnectedComponents(graph: Graph): string[][] {
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  function visit(node: string): void {
    indexes.set(node, indexes.size);
    lowLinks.set(node, indexes.size - 1);
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!indexes.has(next)) {
        visit(next);
        lowLinks.set(node, Math.min(lowLinks.get(node) ?? 0, lowLinks.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowLinks.set(node, Math.min(lowLinks.get(node) ?? 0, indexes.get(next) ?? 0));
      }
    }
    if (lowLinks.get(node) !== indexes.get(node)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    components.push(component);
  }

  for (const node of graph.keys()) {
    if (!indexes.has(node)) visit(node);
  }
  return components;
}

function cycleEdges(graph: Graph): string[] {
  const componentOf = new Map<string, number>();
  stronglyConnectedComponents(graph).forEach((component, index) => {
    if (component.length > 1) component.forEach((node) => componentOf.set(node, index));
  });
  return [...graph].flatMap(([from, targets]) =>
    [...targets]
      .filter((to) => componentOf.has(from) && componentOf.get(from) === componentOf.get(to))
      .map((to) => `${from} -> ${to}`),
  );
}

function collectViolations(): string[] {
  const files = listSourceFiles(sourceDirectory).map((file) => file.split("\\").join("/"));
  const sources = new Set(files);
  const dependencies = files.flatMap((file) => readDependencies(file, sources));
  const violations = new Set<string>();
  const moduleGraph: Graph = new Map();
  const runtimeGraph: Graph = new Map();

  for (const { from, to, kind } of dependencies) {
    const source = moduleOf(from);
    const target = moduleOf(to);
    if (kind === "value") addEdge(runtimeGraph, from, to);
    if (source.name === target.name) continue;
    if (allowedLayers[source.layer].includes(target.layer)) {
      addEdge(moduleGraph, source.name, target.name);
    } else {
      violations.add(`layer ${from} -> ${to}`);
    }
    if (!isPublicFile(to, target)) violations.add(`internal ${from} -> ${to}`);
  }
  for (const edge of cycleEdges(moduleGraph)) violations.add(`module-cycle ${edge}`);
  for (const edge of cycleEdges(runtimeGraph)) violations.add(`file-cycle ${edge}`);
  return [...violations].sort();
}

function readBaseline(): Set<string> {
  const lines = readFileSync(baselinePath, "utf8").split("\n");
  return new Set(lines.filter((line) => line.length > 0));
}

test("workspace modules respect layer, public API, and cycle rules beyond the baseline", async () => {
  const violations = collectViolations();
  const baseline = readBaseline();
  const added = violations.filter((violation) => !baseline.has(violation));
  expect(
    added,
    "New module boundary violations. Fix them, see docs/adr/0055-workspace-module-boundaries.md",
  ).toEqual([]);
  await expect(`${violations.join("\n")}\n`).toMatchFileSnapshot(baselineFile);
});

test("the dependency scanner sees every workspace layer", () => {
  const layers = new Set(listSourceFiles(sourceDirectory).map((file) => moduleOf(file).layer));
  expect([...layers].sort()).toEqual(
    ["app", "commands", "contracts", "feature", "platform", "shared", "shell", "store"].sort(),
  );
});
