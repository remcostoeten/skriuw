import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const APP_SRC = join(ROOT, "apps/web/src");
const APP_GENERATED = join(ROOT, "apps/web/generated");
const SPA_SRC = join(ROOT, "packages/web-spa/src");

const ENTRY_POINTS = [join(SPA_SRC, "main.tsx"), join(SPA_SRC, "router.tsx")];

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const INDEX_FILES = RESOLVE_EXTENSIONS.map((ext) => `index${ext}`);

const SHIMMED_SPECIFIERS = new Set([
	"next/navigation",
	"next/link",
	"next/dynamic",
	"next/image",
	"next/font/google",
	"next/headers",
	"next/server",
	"next/cache",
	"next/og",
	"server-only",
	"client-only",
	"node:crypto",
	"crypto",
	"node:util",
	"@/lib/prisma",
	"@/lib/auth",
	"@/generated/prisma/client",
	"@/core/workspace-backend/server-backend",
]);

const FORBIDDEN_SPECIFIERS = new Set([
	"server-only",
	"next/headers",
	"next/server",
	"next/cache",
	"@/lib/prisma",
	"@/lib/auth",
	"@/generated/prisma/client",
]);

const IMPORT_PATTERN =
	/(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;

type Violation = { file: string; reason: string };

/** Reads a source file, returning its text or `null` when unreadable. */
function readSource(file: string): string | null {
	try {
		if (!statSync(file).isFile()) return null;
		return readFileSync(file, "utf8");
	} catch {
		return null;
	}
}

/** Resolves an alias-or-relative specifier to an absolute on-disk path, or `null`. */
function resolveSpecifier(specifier: string, fromFile: string): string | null {
	let base: string | null = null;
	if (specifier.startsWith("@/generated/")) {
		base = join(APP_GENERATED, specifier.slice("@/generated/".length));
	} else if (specifier === "@/generated") {
		base = APP_GENERATED;
	} else if (specifier.startsWith("@/")) {
		base = join(APP_SRC, specifier.slice("@/".length));
	} else if (specifier.startsWith("./") || specifier.startsWith("../")) {
		base = resolve(dirname(fromFile), specifier);
	} else {
		return null;
	}
	return resolveFileTarget(base);
}

/** Expands a path to a concrete file by trying extensions and index files. */
function resolveFileTarget(base: string): string | null {
	if (existsSync(base) && statSync(base).isFile()) return base;
	for (const ext of RESOLVE_EXTENSIONS) {
		const candidate = `${base}${ext}`;
		if (existsSync(candidate)) return candidate;
	}
	if (existsSync(base) && statSync(base).isDirectory()) {
		for (const index of INDEX_FILES) {
			const candidate = join(base, index);
			if (existsSync(candidate)) return candidate;
		}
	}
	return null;
}

/** Extracts every static and dynamic import specifier from source text. */
function extractSpecifiers(source: string): string[] {
	const specifiers: string[] = [];
	let match: RegExpExecArray | null;
	IMPORT_PATTERN.lastIndex = 0;
	while ((match = IMPORT_PATTERN.exec(source)) !== null) {
		const specifier = match[1] ?? match[2] ?? match[3];
		if (specifier) specifiers.push(specifier);
	}
	return specifiers;
}

/** True when the file opens with a top-level `"use server"` directive. */
function hasUseServerDirective(source: string): boolean {
	const lines = source.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === "") continue;
		if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*"))
			continue;
		return /^["']use server["'];?$/.test(trimmed);
	}
	return false;
}

/** Walks the SPA import graph and collects portability violations. */
function check(): Violation[] {
	const violations: Violation[] = [];
	const visited = new Set<string>();
	const queue: string[] = [];

	for (const entry of ENTRY_POINTS) {
		if (existsSync(entry)) queue.push(entry);
	}

	while (queue.length > 0) {
		const file = queue.shift() as string;
		if (visited.has(file)) continue;
		visited.add(file);

		const source = readSource(file);
		if (source === null) continue;
		const rel = relative(ROOT, file);

		if (hasUseServerDirective(source)) {
			violations.push({ file: rel, reason: 'contains top-level "use server" directive' });
		}

		for (const specifier of extractSpecifiers(source)) {
			if (SHIMMED_SPECIFIERS.has(specifier)) continue;

			if (FORBIDDEN_SPECIFIERS.has(specifier)) {
				violations.push({
					file: rel,
					reason: `imports forbidden server-only specifier "${specifier}"`,
				});
				continue;
			}

			const target = resolveSpecifier(specifier, file);
			if (target && !visited.has(target)) queue.push(target);
		}
	}

	return violations;
}

const BASELINE_FILE = join(ROOT, "scripts/portable-baseline.json");

/** Stable string key for a violation, used to diff against the baseline. */
function violationKey(violation: Violation): string {
	return `${violation.file} -> ${violation.reason}`;
}

/** Loads the baseline of known, shim-neutralized violations (empty if absent). */
function loadBaseline(): Set<string> {
	const source = readSource(BASELINE_FILE);
	if (source === null) return new Set();
	try {
		const parsed = JSON.parse(source) as { violations?: string[] };
		return new Set(parsed.violations ?? []);
	} catch {
		return new Set();
	}
}

function writeBaseline(keys: string[]): void {
	const body = {
		comment:
			"Known server-only modules reachable from the SPA graph. They are neutralized by the Vite shims (prisma/auth stubbed) and capability gating; tracked here so check:portable only fails on NEW leaks. Regenerate with: bun scripts/check-portable.ts --update-baseline",
		violations: [...keys].sort(),
	};
	writeFileSync(BASELINE_FILE, `${JSON.stringify(body, null, "\t")}\n`);
}

function main(): void {
	const violations = check();
	const keys = violations.map(violationKey);

	if (process.argv.includes("--update-baseline")) {
		writeBaseline(keys);
		console.log(`check:portable — baseline updated with ${keys.length} entry(ies).`);
		process.exit(0);
	}

	const baseline = loadBaseline();
	const introduced = violations.filter((violation) => !baseline.has(violationKey(violation)));
	const currentKeys = new Set(keys);
	const stale = [...baseline].filter((key) => !currentKeys.has(key));

	if (stale.length > 0) {
		console.log(
			`check:portable — ${stale.length} baseline entry(ies) no longer leak; run --update-baseline to trim.`,
		);
	}

	if (introduced.length === 0) {
		console.log(
			`check:portable — clean (no new leaks; ${baseline.size} known/neutralized baselined).`,
		);
		process.exit(0);
	}

	console.error(`check:portable — found ${introduced.length} NEW portability violation(s):\n`);
	for (const violation of introduced) {
		console.error(`${violation.file} -> ${violation.reason}`);
	}
	console.error(
		"\nIf this is expected and neutralized by a Vite shim, run: bun scripts/check-portable.ts --update-baseline",
	);
	process.exit(1);
}

main();
