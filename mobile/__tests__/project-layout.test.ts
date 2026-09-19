import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readAppConfig(): {
  name: string;
  slug: string;
  scheme: string;
  ios: { bundleIdentifier: string };
  android: { package: string };
  plugins: unknown[];
} {
  return JSON.parse(readFileSync(resolve(projectRoot, "app.json"), "utf8")).expo;
}

test("the application declares the identifiers the store builds need", () => {
  const config = readAppConfig();
  assert.match(config.ios.bundleIdentifier, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  assert.match(config.android.package, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
  assert.equal(config.android.package, config.ios.bundleIdentifier);
});

test("deep links resolve through a declared scheme", () => {
  const config = readAppConfig();
  assert.match(config.scheme, /^[a-z][a-z0-9+.-]*$/);
});

test("expo-router owns navigation", () => {
  const config = readAppConfig();
  const pluginNames = config.plugins.map((plugin) =>
    Array.isArray(plugin) ? plugin[0] : plugin,
  );
  assert.ok(pluginNames.includes("expo-router"));
});

test("app/ holds routes only and src/ holds everything else", () => {
  assert.ok(existsSync(resolve(projectRoot, "app")));
  assert.ok(existsSync(resolve(projectRoot, "src")));
  assert.equal(existsSync(resolve(projectRoot, "src", "app")), false);

  const routes = readdirSync(resolve(projectRoot, "app"), {
    recursive: true,
    withFileTypes: true,
  }).filter((entry) => entry.isFile());

  assert.ok(routes.length > 0);
  for (const route of routes) {
    assert.match(route.name, /\.tsx$/);
  }
});
