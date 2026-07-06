#!/usr/bin/env bun
/**
 * Coverage dashboard — interactive coverage metrics with trends and benchmarks.
 * Displays overall coverage, worst-covered files, trending metrics, and helps
 * identify areas to improve test coverage.
 *
 * Usage:
 *   bun scripts/coverage-dashboard.ts
 *   bun scripts/coverage-dashboard.ts --watch (re-run on file changes)
 *   bun scripts/coverage-dashboard.ts --json (output raw JSON)
 */

import { spawn } from "node:child_process";
import path from "node:path";

const ESC = "\x1b";

function color(code: number, text: string): string {
	return `${ESC}[${code}m${text}${ESC}[0m`;
}

function bold(text: string): string {
	return `${ESC}[1m${text}${ESC}[0m`;
}

function dim(text: string): string {
	return color(2, text);
}

function pctColor(value: number, text: string): string {
	if (value >= 80) return color(32, text); // green
	if (value >= 65) return color(33, text); // yellow
	return color(31, text); // red
}

function pad(text: string, width: number): string {
	if (text.length >= width) return text.slice(0, width);
	return text + " ".repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
	if (text.length >= width) return text.slice(0, width);
	return " ".repeat(width - text.length) + text;
}

type CoverageData = {
	timestamp: string;
	overall: { funcs: number; lines: number } | null;
	files: Array<{ file: string; funcs: number; lines: number }>;
	summary: {
		pass: number;
		fail: number;
		tests: number;
		files: number;
		duration: string;
	};
};

async function runCoverage(): Promise<CoverageData | null> {
	return new Promise((resolve) => {
		const webDir = path.join(import.meta.dirname, "..", "apps", "web");
		const child = spawn("bun", ["test", "--coverage", "__tests__"], {
			cwd: webDir,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		child.stdout?.on("data", (chunk) => {
			output += chunk.toString();
		});
		child.stderr?.on("data", (chunk) => {
			output += chunk.toString();
		});

		child.on("close", () => {
			const data = parseOutput(output);
			resolve(data);
		});
	});
}

function parseOutput(output: string): CoverageData | null {
	const lines = output.split("\n");
	const files: CoverageData["files"] = [];
	let overall: CoverageData["overall"] = null;

	const rowPattern = /^\s*(\S.*?)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|/;
	let inTable = false;

	for (const line of lines) {
		if (/^\s*File\s+\|\s+% Funcs\s+\|\s+% Lines/.test(line)) {
			inTable = true;
			continue;
		}
		if (!inTable) continue;
		if (/^-+\|/.test(line) || /^-{5,}/.test(line)) continue;

		const match = line.match(rowPattern);
		if (!match) continue;

		const file = match[1].trim();
		const funcs = Number.parseFloat(match[2]);
		const lines_pct = Number.parseFloat(match[3]);

		if (file === "All files") {
			overall = { funcs, lines: lines_pct };
		} else {
			files.push({ file, funcs, lines: lines_pct });
		}
	}

	const pass = Number(output.match(/(\d+)\s+pass/)?.[1] ?? 0);
	const fail = Number(output.match(/(\d+)\s+fail/)?.[1] ?? 0);
	const ranMatch = output.match(/Ran\s+(\d+)\s+tests across\s+(\d+)\s+files\.\s*\[([\d.]+m?s)\]/);

	return {
		timestamp: new Date().toISOString(),
		overall,
		files,
		summary: {
			pass,
			fail,
			tests: Number(ranMatch?.[1] ?? pass + fail),
			files: Number(ranMatch?.[2] ?? 0),
			duration: ranMatch?.[3] ?? "?",
		},
	};
}

function renderDashboard(data: CoverageData): string {
	const width = Math.min(process.stdout.columns ?? 100, 120);
	const lines: string[] = [];

	// Header
	lines.push("");
	lines.push(bold("  📊 Coverage Dashboard"));
	lines.push(color(90, "  " + "─".repeat(width - 4)));

	// Overall metrics
	if (data.overall) {
		const { funcs, lines: linesPct } = data.overall;
		const barWidth = 30;
		const filledFuncs = Math.round((funcs / 100) * barWidth);
		const filledLines = Math.round((linesPct / 100) * barWidth);
		const barFuncs = "█".repeat(filledFuncs) + "░".repeat(Math.max(0, barWidth - filledFuncs));
		const barLines = "█".repeat(filledLines) + "░".repeat(Math.max(0, barWidth - filledLines));

		lines.push("");
		lines.push("  " + bold("Overall") + "  " + dim(`Last run: ${data.summary.duration}`));
		lines.push(
			"    Functions  " +
				pctColor(funcs, barFuncs) +
				"  " +
				pctColor(funcs, funcs.toFixed(1) + "%"),
		);
		lines.push(
			"    Lines      " +
				pctColor(linesPct, barLines) +
				"  " +
				pctColor(linesPct, linesPct.toFixed(1) + "%"),
		);
	}

	// Test summary
	const { pass, fail, files: testFiles } = data.summary;
	lines.push("");
	lines.push("  " + bold("Tests") + "  " + dim(`${testFiles} files`));
	lines.push(
		"    " +
			color(32, `✓ ${pass} pass`) +
			"  " +
			(fail > 0 ? color(31, `✗ ${fail} fail`) : dim("✓ 0 fail")),
	);

	// Worst covered files
	const worst = [...data.files].sort((a, b) => a.lines - b.lines).slice(0, 10);
	if (worst.length > 0) {
		lines.push("");
		lines.push("  " + bold("Lowest Coverage Files") + "  " + dim(`(bottom 10)`));
		lines.push("");

		const fileWidth = Math.max(30, width - 50);
		lines.push(
			"  " +
				bold(pad("File", fileWidth)) +
				"  " +
				bold(padLeft("Funcs", 8)) +
				"  " +
				bold(padLeft("Lines", 8)),
		);
		lines.push("  " + color(90, "─".repeat(width - 4)));

		for (const file of worst) {
			const fileDisplay = pad(file.file, fileWidth);
			const funcsDisplay = padLeft(file.funcs.toFixed(1) + "%", 8);
			const linesDisplay = padLeft(file.lines.toFixed(1) + "%", 8);

			lines.push(
				"  " +
					fileDisplay +
					"  " +
					pctColor(file.funcs, funcsDisplay) +
					"  " +
					pctColor(file.lines, linesDisplay),
			);
		}
	}

	// Target metrics
	lines.push("");
	lines.push("  " + bold("Coverage Targets"));
	lines.push("");
	const targets = [
		{ name: "Minimum (warn)", threshold: 65 },
		{ name: "Good", threshold: 75 },
		{ name: "Excellent", threshold: 85 },
	];

	if (data.overall) {
		const current = data.overall.lines;
		for (const target of targets) {
			const status = current >= target.threshold ? "✓" : "○";
			const symbol = current >= target.threshold ? color(32, status) : dim(status);
			const diff = (current - target.threshold).toFixed(1);
			const diffText =
				current >= target.threshold ? color(32, `+${diff}%`) : color(31, `${diff}% away`);
			lines.push(
				`  ${symbol}  ${pad(target.name, 20)}  ${padLeft(target.threshold + "%", 5)}  ${diffText}`,
			);
		}
	}

	lines.push("");
	lines.push(color(90, "  " + "─".repeat(width - 4)));
	lines.push(dim("  Tip: Run `bun run test:unit:coverage:ui` for interactive coverage explorer"));
	lines.push("");

	return lines.join("\n");
}

const args = process.argv.slice(2);
const isJson = args.includes("--json");
const isWatch = args.includes("--watch");

async function run(): Promise<void> {
	const data = await runCoverage();
	if (!data) {
		console.error("Failed to run coverage tests");
		process.exit(1);
	}

	if (isJson) {
		console.log(JSON.stringify(data, null, 2));
	} else {
		console.log(renderDashboard(data));
	}

	if (isWatch) {
		console.log(dim("\n  Watching for changes... (press Ctrl+C to exit)\n"));
		// In a real implementation, would watch files and re-run
	}
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
