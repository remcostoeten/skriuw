import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { SHELL_DESTINATIONS, type ShellRoute } from "../destinations";

const appDir = resolve(__dirname, "../../../workspace");

/**
 * The destinations whose surface is genuinely not built yet. A view that ships
 * without being taken off this list is a view nobody can reach — which is how
 * the tasks surface sat finished behind a placeholder for the length of the
 * mobile epic.
 */
const PLACEHOLDER_ROUTES: readonly ShellRoute[] = ["tags", "people", "trash"];

function routeFile(route: ShellRoute): string {
  const destination = SHELL_DESTINATIONS.find((candidate) => candidate.route === route);
  assert.ok(destination, `no destination for ${route}`);
  const name = destination.path === "/" ? "index" : destination.path.replace(/^\//, "");
  return resolve(appDir, `${name}.tsx`);
}

test("every destination the shell offers has a route to land on", () => {
  for (const destination of SHELL_DESTINATIONS) {
    const file = routeFile(destination.route);
    assert.ok(existsSync(file), `${destination.path} has no route file at ${file}`);
  }
});

test("only the surfaces that do not exist yet render a placeholder", () => {
  const placeholders = SHELL_DESTINATIONS.filter((destination) =>
    readFileSync(routeFile(destination.route), "utf8").includes("RoutePlaceholder"),
  ).map((destination) => destination.route);

  assert.deepEqual(
    [...placeholders].sort(),
    [...PLACEHOLDER_ROUTES].sort(),
    "a route gained or lost its surface; update PLACEHOLDER_ROUTES with it",
  );
});
