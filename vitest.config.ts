import { fileURLToPath } from "node:url";
import { defineConfig, type TestProjectInlineConfiguration } from "vitest/config";
import { resolveFromOwner } from "./__tests__/support/resolve-from-owner.ts";
import { standIns } from "./__tests__/support/stand-ins.ts";

const repositoryDirectory = fileURLToPath(new URL(".", import.meta.url));
const mobileStubs = `${repositoryDirectory}__tests__/apps/mobile/src/shell`;

type Alias = { find: string | RegExp; replacement: string };
type Suite = {
  sourceAlias?: string;
  aliases?: readonly Alias[];
  replacements?: Readonly<Record<string, string>>;
};

function suite(name: string, path: string, options: Suite = {}): TestProjectInlineConfiguration {
  const { sourceAlias, aliases = [], replacements } = options;
  const source =
    sourceAlias === undefined
      ? []
      : [{ find: "@", replacement: `${repositoryDirectory}${sourceAlias}` }];
  return {
    plugins: [
      resolveFromOwner(repositoryDirectory),
      ...(replacements === undefined ? [] : [standIns(replacements)]),
    ],
    resolve: { alias: [...source, ...aliases] },
    test: {
      name,
      root: repositoryDirectory,
      include: [`__tests__/${path}/**/*.test.{ts,tsx}`],
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      suite("workspace", "apps/workspace/{src,performance}", { sourceAlias: "apps/workspace/src" }),
      suite("ui-architecture", "apps/workspace/harnesses/ui-architecture"),
      suite("renderer-store", "apps/workspace/harnesses/renderer-store"),
      suite("mobile", "apps/mobile", {
        sourceAlias: "apps/mobile/src",
        aliases: [
          {
            find: /^react-native(-safe-area-context)?$/,
            replacement: `${mobileStubs}/react-native-stub.ts`,
          },
        ],
        replacements: Object.fromEntries(
          ["theme", "icons", "workspace-provider"].map((module) => [
            `${repositoryDirectory}apps/mobile/src/shell/${module}.tsx`,
            `${mobileStubs}/shell-stubs.ts`,
          ]),
        ),
      }),
      suite("site", "apps/site", { sourceAlias: "apps/site/src" }),
      suite("renderer-core", "packages/renderer-core"),
      suite("icons", "packages/icons"),
      suite("theme", "packages/theme"),
      suite("shared", "packages/shared"),
      suite("storybook-shell", "packages/storybook-shell"),
    ],
    coverage: {
      provider: "v8",
      include: ["apps/workspace/src/**/*.{ts,tsx}", "packages/renderer-core/src/**/*.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: ".build/coverage/workspace",
    },
  },
});
