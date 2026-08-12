/**
 * Unit-test runner with guaranteed per-file isolation.
 *
 * `bun test --isolate` gives each file a fresh module registry, but that
 * isolation is not honoured reliably in every environment (CI containers have
 * been observed to leak `mock.module` overrides across files). Several suites
 * replace shared modules — `react`, `zustand`, `@/features/notes/store`,
 * `@/core/analytics/config` — with partial stand-ins, and `mock.restore()`
 * cannot undo a `mock.module` in Bun, so a leak permanently breaks every later
 * file that imports the real module.
 *
 * To stay correct regardless of the runner's isolation guarantees, every file
 * that installs a module mock (directly, or via the shared layout-mock fixture)
 * runs in its own `bun test` process. The remaining leak-free files run together
 * in a single pooled process. New mock-using suites are routed automatically —
 * the split is derived from file contents, not a hand-maintained list.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { cpus } from "node:os";

const TESTS_DIR = join(import.meta.dir, "..", "__tests__");
const MOCKING_MARKERS = ["mock.module", "use-notes-layout-mocks"];

function collectTestFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectTestFiles(full));
		} else if (/\.test\.tsx?$/.test(entry.name)) {
			files.push(full);
		}
	}
	return files.sort();
}

function installsModuleMock(file: string): boolean {
	const source = readFileSync(file, "utf8");
	return MOCKING_MARKERS.some((marker) => source.includes(marker));
}

function runBunTest(files: string[]): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn("bun", ["test", ...files], { stdio: "inherit" });
		child.on("close", (code) => resolve(code === 0));
	});
}

async function runWithConcurrency<T>(
	items: T[],
	limit: number,
	worker: (item: T) => Promise<boolean>,
): Promise<boolean> {
	let cursor = 0;
	let ok = true;
	async function next(): Promise<void> {
		const index = cursor++;
		if (index >= items.length) return;
		const passed = await worker(items[index]);
		if (!passed) ok = false;
		await next();
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
	return ok;
}

async function main() {
	const all = collectTestFiles(TESTS_DIR);
	const isolated: string[] = [];
	const pooled: string[] = [];
	for (const file of all) {
		(installsModuleMock(file) ? isolated : pooled).push(file);
	}

	console.log(`[unit] ${all.length} files: ${pooled.length} pooled, ${isolated.length} isolated`);

	const pooledOk = pooled.length === 0 ? true : await runBunTest(pooled);
	const isolatedOk = await runWithConcurrency(isolated, Math.max(2, cpus().length - 2), (file) =>
		runBunTest([file]),
	);

	if (!pooledOk || !isolatedOk) {
		console.error("[unit] one or more test files failed");
		process.exit(1);
	}
	console.log("[unit] all test files passed");
}

main();
