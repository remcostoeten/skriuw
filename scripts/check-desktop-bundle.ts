import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { collectManifestGraph, type ManifestChunk } from "../packages/web-spa/src/bundle-manifest";

type Budget = {
	staticJsRaw: number;
	staticJsGzip: number;
	staticCssRaw: number;
	staticCssGzip: number;
	staticJsChunks: number;
	largestStaticJsRaw: number;
};

const root = resolve(import.meta.dir, "..");
const dist = join(root, "packages/web-spa/dist");
const manifestPath = join(dist, ".vite/manifest.json");
const budgetPath = join(root, "packages/web-spa/bundle-budget.json");
const reportPath = join(dist, "desktop-bundle-report.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, ManifestChunk>;
const budget = JSON.parse(readFileSync(budgetPath, "utf8")) as Budget;
const staticJsRawOverride = process.env.SKRIUW_DESKTOP_BUNDLE_MAX_STATIC_JS_RAW;
if (staticJsRawOverride) {
	const parsed = Number.parseInt(staticJsRawOverride, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error("SKRIUW_DESKTOP_BUNDLE_MAX_STATIC_JS_RAW must be a non-negative integer");
	}
	budget.staticJsRaw = parsed;
}
const graph = collectManifestGraph(manifest);

function bytes(relativePath: string) {
	const content = readFileSync(join(dist, relativePath));
	return { raw: statSync(join(dist, relativePath)).size, gzip: gzipSync(content).byteLength };
}

const jsFiles = graph.staticKeys
	.map((key) => manifest[key]!.file)
	.filter((file) => file.endsWith(".js"));
const cssFiles = graph.staticCss;
const jsSizes = jsFiles.map((file) => ({ file, ...bytes(file) }));
const cssSizes = cssFiles.map((file) => ({ file, ...bytes(file) }));
const sum = (values: Array<{ raw: number; gzip: number }>, key: "raw" | "gzip") =>
	values.reduce((total, value) => total + value[key], 0);

const measured: Budget = {
	staticJsRaw: sum(jsSizes, "raw"),
	staticJsGzip: sum(jsSizes, "gzip"),
	staticCssRaw: sum(cssSizes, "raw"),
	staticCssGzip: sum(cssSizes, "gzip"),
	staticJsChunks: jsFiles.length,
	largestStaticJsRaw: Math.max(0, ...jsSizes.map((asset) => asset.raw)),
};

const report = {
	entry: graph.entryKey,
	measured,
	budget,
	staticAssets: [...jsSizes, ...cssSizes].sort((a, b) => b.raw - a.raw),
	dynamicImports: graph.dynamicKeys.map((key) => manifest[key]?.file ?? key).sort(),
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Desktop bundle report: ${reportPath}`);
for (const key of Object.keys(measured) as Array<keyof Budget>) {
	console.log(`${key}: ${measured[key].toLocaleString()} / ${budget[key].toLocaleString()}`);
}
console.log("Largest static assets:");
for (const asset of report.staticAssets.slice(0, 8)) {
	console.log(
		`  ${asset.file}: ${asset.raw.toLocaleString()} raw, ${asset.gzip.toLocaleString()} gzip`,
	);
}

const failures = (Object.keys(measured) as Array<keyof Budget>).filter(
	(key) => measured[key] > budget[key],
);
if (failures.length > 0) {
	for (const key of failures) {
		console.error(`Bundle budget exceeded for ${key}: ${measured[key]} > ${budget[key]}`);
	}
	process.exit(1);
}
