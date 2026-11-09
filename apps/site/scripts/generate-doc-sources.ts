import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const siteDir = path.resolve(import.meta.dirname, "..");
const repoDir = path.resolve(siteDir, "../..");
const outFile = path.join(siteDir, "src/modules/docs/generated/sources.ts");
const adrFile = /^\d{4}-[\w-]+\.md$/;
const fixedSources = [
  "docs/FEATURES.md",
  "docs/ARCHITECTURE.md",
  "docs/performance-contract.md",
  "CHANGELOG.md",
];

async function readSource(source: string) {
  return [source, await readFile(path.join(repoDir, source), "utf8")] as const;
}

async function listAdrSources() {
  const files = await readdir(path.join(repoDir, "docs/adr"));

  return files
    .filter((file) => adrFile.test(file))
    .sort()
    .map((file) => `docs/adr/${file}`);
}

async function main() {
  const sources = [...fixedSources, ...(await listAdrSources())];
  const entries = await Promise.all(sources.map(readSource));
  const body = JSON.stringify(Object.fromEntries(entries), null, 2);

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(
    outFile,
    `export const docSources: Readonly<Record<string, string>> = ${body};\n`,
  );
}

await main();
