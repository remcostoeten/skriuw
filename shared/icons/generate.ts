import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { renderIconData } from "./render-data";

const REPO_DIR = join(dirname(fileURLToPath(import.meta.url)), "../..");

const check = process.argv.includes("--check");
const stale: string[] = [];
for (const [path, contents] of renderIconData()) {
  const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  if (current === contents) continue;
  if (check) {
    stale.push(relative(REPO_DIR, path));
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  console.log(`wrote ${relative(REPO_DIR, path)}`);
}
if (stale.length > 0) {
  console.error(`Icon data is out of date: ${stale.join(", ")}. Run \`bun shared/icons/generate.ts\`.`);
  process.exit(1);
}
