import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDirectory = fileURLToPath(new URL("../..", import.meta.url));

/** Absolute path of a repository-relative path, independent of where the suite lives. */
export function repositoryPath(...segments: string[]): string {
  return join(repositoryDirectory, ...segments);
}
