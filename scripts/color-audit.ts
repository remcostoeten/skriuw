import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

const INCLUDE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".json"]);
const SKIP_DIRS = new Set([".git", ".next", "node_modules", "coverage", "__tests__"]);
const ALLOWED_PATHS = [
	"apps/mobile/",
	"public/manifest.json",
	"src/shared/PixelBlast.jsx",
	"src/app/themes/",
	"src/features/settings/preferences/themes.ts",
	"scripts/color-audit.ts",
];

const COLOR_PATTERN =
	/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla\([^)]*\)|hsl\((?!var\()[^)]*\)|oklch\([^)]*\)|\b(?:bg|text|border|ring|from|via|to|fill|stroke|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)-[0-9]{2,3}/g;

function extension(path: string) {
	const index = path.lastIndexOf(".");
	return index === -1 ? "" : path.slice(index);
}

function walk(dir: string): string[] {
	const entries = readdirSync(dir);
	const files: string[] = [];

	for (const entry of entries) {
		const path = join(dir, entry);
		const stat = statSync(path);

		if (stat.isDirectory()) {
			if (!SKIP_DIRS.has(entry)) {
				files.push(...walk(path));
			}
			continue;
		}

		if (INCLUDE_EXTENSIONS.has(extension(path))) {
			files.push(path);
		}
	}

	return files;
}

function isAllowed(path: string) {
	return ALLOWED_PATHS.some((allowed) => path.startsWith(allowed));
}

const findings = walk(ROOT)
	.map((path) => {
		const rel = relative(ROOT, path);
		if (isAllowed(rel)) return [];

		const lines = readFileSync(path, "utf8").split("\n");
		return lines.flatMap((line, index) => {
			if (line.includes("${")) return [];
			const matches = line.match(COLOR_PATTERN);
			if (!matches) return [];

			return matches.map((match) => ({
				path: rel,
				line: index + 1,
				match,
			}));
		});
	})
	.flat();

if (findings.length === 0) {
	console.log("No hard-coded colors found outside approved theme files.");
	process.exit(0);
}

for (const finding of findings) {
	console.log(`${finding.path}:${finding.line} ${finding.match}`);
}

console.log(`\nFound ${findings.length} hard-coded color reference(s).`);

if (STRICT) {
	process.exit(1);
}
