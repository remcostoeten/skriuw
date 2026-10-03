import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { renderSettingsSearchCopy } from "./render";

const check = process.argv.includes("--check");
const [path, contents] = renderSettingsSearchCopy();
const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;

if (current !== contents) {
  if (check) {
    console.error(
      `${relative(process.cwd(), path)} is out of date. Run \`bun apps/workspace/scripts/settings-search/generate.ts\`.`,
    );
    process.exit(1);
  }
  writeFileSync(path, contents);
  console.log(`wrote ${relative(process.cwd(), path)}`);
}
