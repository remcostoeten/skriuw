import { spawn } from "node:child_process";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPOSITORY = resolve(ROOT, "../..");
const SRC = resolve(ROOT, "src");
const TESTS = resolve(REPOSITORY, "__tests__/apps/workspace/src");
const RESULTS = resolve(REPOSITORY, ".build/coverage/workspace/results.json");
const COVERAGE_SUMMARY = resolve(REPOSITORY, ".build/coverage/workspace/coverage-summary.json");

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const WARN = "\x1b[33m⚠\x1b[0m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const GRAY = "\x1b[90m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

let exitCode = 0;

const ENTRY_POINTS = new Set(["main.tsx", "vite-env.d.ts"]);

type TestCounts = {
  total: number;
  pass: number;
  fail: number;
  skip: number;
};

type CoveragePct = {
  lines: number | null;
  branches: number | null;
  funcs: number | null;
};

type FileEntry = {
  /** relative from src/ */
  rel: string;
  /** expected test path relative from __tests__/ */
  testRel: string;
  tested: boolean;
};

type DirCoverage = {
  dir: string;
  total: number;
  tested: number;
  entries: FileEntry[];
};

function runTests(): Promise<{ counts: TestCounts; coverage: CoveragePct }> {
  return new Promise((resolvePromise) => {
    const child = spawn(
      resolve(REPOSITORY, "node_modules", ".bin", "vitest"),
      [
        "run",
        "--project",
        "workspace",
        "--project",
        "renderer-core",
        "--project",
        "shared",
        "--coverage",
        "--reporter=default",
        "--reporter=json",
        `--outputFile.json=${RESULTS}`,
      ],
      { cwd: REPOSITORY, stdio: "inherit", shell: false },
    );

    child.on("close", (code) => {
      exitCode = code ?? 1;
      resolvePromise({ counts: readCounts(), coverage: readCoverage() });
    });
  });
}

function readCounts(): TestCounts {
  if (!existsSync(RESULTS)) return { total: 0, pass: 0, fail: 0, skip: 0 };
  const results = JSON.parse(readFileSync(RESULTS, "utf-8")) as {
    numTotalTests: number;
    numPassedTests: number;
    numFailedTests: number;
    numPendingTests: number;
    numTodoTests: number;
  };
  return {
    total: results.numTotalTests,
    pass: results.numPassedTests,
    fail: results.numFailedTests,
    skip: results.numPendingTests + results.numTodoTests,
  };
}

function readCoverage(): CoveragePct {
  if (!existsSync(COVERAGE_SUMMARY)) return { lines: null, branches: null, funcs: null };
  const { total } = JSON.parse(readFileSync(COVERAGE_SUMMARY, "utf-8")) as {
    total: Record<"lines" | "branches" | "functions", { pct: number }>;
  };
  return { lines: total.lines.pct, branches: total.branches.pct, funcs: total.functions.pct };
}

function walkDir(dir: string, base: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, base));
    } else if (entry.isFile() && /\.([jt]sx?)$/.test(entry.name)) {
      results.push(relative(base, full));
    }
  }
  return results;
}

function isEntryPoint(rel: string): boolean {
  return ENTRY_POINTS.has(basename(rel));
}

function analyzeFiles(): DirCoverage[] {
  if (!existsSync(SRC)) return [];

  const srcFiles = walkDir(SRC, SRC);

  const entries: FileEntry[] = srcFiles
    .filter((rel) => !isEntryPoint(rel))
    .map((rel) => {
      const testRel = rel.replace(/\.tsx?$/, ".test.ts").replace(/\.jsx?$/, ".test.js");
      const testFull = resolve(TESTS, testRel);
      return { rel, testRel, tested: existsSync(testFull) };
    });

  const dirMap = new Map<string, FileEntry[]>();

  for (const e of entries) {
    const d = dirname(e.rel);
    const label = d === "." ? "(root)" : d;
    if (!dirMap.has(label)) dirMap.set(label, []);
    dirMap.get(label)!.push(e);
  }

  const dirs: DirCoverage[] = [];
  for (const [dir, entries] of dirMap) {
    const tested = entries.filter((e) => e.tested).length;
    dirs.push({ dir, total: entries.length, tested, entries });
  }

  dirs.sort((a, b) => a.dir.localeCompare(b.dir));

  return dirs;
}

function pctColor(v: number): string {
  if (v >= 80) return `${GREEN}${v}%${RESET}`;
  if (v >= 50) return `${YELLOW}${v}%${RESET}`;
  return `${RED}${v}%${RESET}`;
}

function bar(tested: number, total: number, width = 10): string {
  const filled = Math.round((tested / Math.max(total, 1)) * width);
  return `${GREEN}${"●".repeat(filled)}${GRAY}${"○".repeat(width - filled)}${RESET}`;
}

function printVerdict(counts: TestCounts, coverage: CoveragePct, dirs: DirCoverage[]): void {
  const totalSrc = dirs.reduce((s, d) => s + d.total, 0);
  const totalTested = dirs.reduce((s, d) => s + d.tested, 0);

  const allUntested: FileEntry[] = [];
  const zeroDirs: DirCoverage[] = [];

  for (const d of dirs) {
    const untested = d.entries.filter((e) => !e.tested);
    allUntested.push(...untested);
    if (d.tested === 0) zeroDirs.push(d);
  }

  console.log(`\n${BOLD}━━━ Test Verdict ━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  const status = counts.fail === 0 ? PASS : FAIL;
  const parts = [`  ${BOLD}Results${RESET}    ${status}  ${counts.pass} passed`];
  if (counts.fail > 0) parts.push(`${FAIL} ${counts.fail} failed`);
  if (counts.skip > 0) parts.push(`${GRAY}−${RESET} ${counts.skip} skipped`);
  parts.push(`· ${counts.total} total`);
  console.log(parts.join(" "));

  const exitLabel = exitCode === 0 ? `${PASS} all good` : `${FAIL} exit ${exitCode}`;
  console.log(`  ${BOLD}Exit${RESET}      ${exitLabel}`);

  if (coverage.lines !== null) {
    console.log(
      `\n  ${BOLD}Coverage${RESET}   lines ${pctColor(coverage.lines)}` +
        ` · branches ${pctColor(coverage.branches ?? 0)}` +
        ` · funcs ${pctColor(coverage.funcs ?? 0)}`,
    );
  }

  const srcPct = totalSrc > 0 ? Math.round((totalTested / totalSrc) * 100) : 0;
  console.log(
    `\n  ${BOLD}File coverage${RESET}  ${bar(totalTested, totalSrc)}  ${totalTested}/${totalSrc}  ${pctColor(srcPct)}`,
  );

  console.log(`\n  ${BOLD}By module${RESET}\n`);
  for (const d of dirs) {
    const pct = Math.round((d.tested / d.total) * 100);
    const untestedCount = d.total - d.tested;

    console.log(
      `    ${d.dir}/  ${bar(d.tested, d.total)}  ` +
        `${d.tested}/${d.total}  ${pctColor(pct)}` +
        (untestedCount > 0 ? `  ${GRAY}(${untestedCount} missing)${RESET}` : ""),
    );
  }

  if (zeroDirs.length > 0) {
    console.log(`\n  ${WARN} ${BOLD}Entire modules untested${RESET}\n`);
    for (const d of zeroDirs) {
      const files = d.entries.map((e) => e.rel).join(", ");
      console.log(`     ${d.dir}/  (${d.total} file${d.total > 1 ? "s" : ""})`);
      console.log(`        ${GRAY}${files}${RESET}`);
    }
  }

  const untestedNonZero = allUntested.filter((e) => {
    const d = dirs.find((d2) => d2.entries.some((e2) => e2.rel === e.rel && !e2.tested));
    return d && d.tested > 0;
  });

  if (untestedNonZero.length > 0 && zeroDirs.length > 0) {
    console.log(
      `\n  ${WARN} ${BOLD}Also missing${RESET}  ` +
        `${untestedNonZero.length} files in partially-tested modules`,
    );
  }

  let verdict: string;
  if (counts.fail > 0) {
    verdict = `${FAIL} ${BOLD}Failing tests — fix before commit${RESET}`;
  } else if (totalTested === 0) {
    verdict = `${WARN} ${BOLD}No tests found at all${RESET}`;
  } else {
    const missing = totalSrc - totalTested;

    if (missing === 0) {
      verdict = `${PASS} ${BOLD}Full file coverage — every source file has a matching test${RESET}`;
    } else if (zeroDirs.length > 0) {
      verdict =
        `${WARN} ${BOLD}${missing} source files lack tests` +
        ` (${zeroDirs.length} entire module${zeroDirs.length > 1 ? "s" : ""})` +
        `${RESET}`;
    } else {
      verdict =
        `${WARN} ${BOLD}${missing} source files lack tests — ` +
        `distributed across ${untestedNonZero.length > 0 ? "partially-tested" : ""} modules${RESET}`;
    }
  }
  console.log(`\n  ${verdict}\n`);
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);
}

async function main(): Promise<void> {
  const { counts, coverage } = await runTests();
  const dirs = analyzeFiles();
  printVerdict(counts, coverage, dirs);
  process.exit(exitCode);
}

main();
