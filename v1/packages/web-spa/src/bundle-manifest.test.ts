import { describe, expect, test } from "bun:test";
import { collectManifestGraph, type ManifestChunk } from "./bundle-manifest";

describe("desktop bundle manifest", () => {
	test("deduplicates recursive static imports and their CSS", () => {
		const manifest: Record<string, ManifestChunk> = {
			"index.html": {
				file: "index.js",
				isEntry: true,
				imports: ["shared", "feature"],
				css: ["index.css"],
			},
			shared: { file: "shared.js", imports: ["leaf"], css: ["shared.css"] },
			feature: { file: "feature.js", imports: ["leaf"], css: ["shared.css"] },
			leaf: { file: "leaf.js" },
		};

		const graph = collectManifestGraph(manifest);
		expect(graph.staticKeys).toEqual(["index.html", "shared", "leaf", "feature"]);
		expect(graph.staticCss).toEqual(["index.css", "shared.css"]);
	});

	test("reports dynamic imports without charging them to the static graph", () => {
		const manifest: Record<string, ManifestChunk> = {
			"index.html": {
				file: "index.js",
				isEntry: true,
				dynamicImports: ["settings"],
			},
			settings: { file: "settings.js", imports: ["settings-vendor"] },
			"settings-vendor": { file: "settings-vendor.js" },
		};

		const graph = collectManifestGraph(manifest);
		expect(graph.staticKeys).toEqual(["index.html"]);
		expect(graph.dynamicKeys).toEqual(["settings"]);
	});
});
