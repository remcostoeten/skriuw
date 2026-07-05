#!/usr/bin/env bun
/**
 * Generate SVG badge for coverage metrics.
 * Can be embedded in README or used in CI workflows.
 *
 * Usage:
 *   bun scripts/coverage-badge.ts                    (display in console)
 *   bun scripts/coverage-badge.ts --output badge.svg (save to file)
 */

import { readFileSync, writeFileSync } from "node:fs";

function generateBadge(label: string, value: string, color: string): string {
	const labelWidth = label.length * 6.5 + 8;
	const valueWidth = value.length * 6.5 + 8;
	const totalWidth = labelWidth + valueWidth;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <style>
    text { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 11px; font-weight: bold; }
    .label { fill: #555; }
    .value { fill: white; }
    .bg-label { fill: #555; }
    .bg-value { fill: ${color}; }
  </style>
  <rect class="bg-label" width="${labelWidth}" height="20"/>
  <rect class="bg-value" x="${labelWidth}" width="${valueWidth}" height="20"/>
  <text class="label" x="${labelWidth / 2}" y="15" text-anchor="middle">${label}</text>
  <text class="value" x="${labelWidth + valueWidth / 2}" y="15" text-anchor="middle">${value}</text>
</svg>`;
}

async function getCoverageData(): Promise<{
	lines: number;
	funcs: number;
	pass: number;
	fail: number;
} | null> {
	try {
		const data = JSON.parse(readFileSync("coverage.json", "utf-8"));
		return {
			lines: data.overall?.lines ?? 0,
			funcs: data.overall?.funcs ?? 0,
			pass: data.summary?.pass ?? 0,
			fail: data.summary?.fail ?? 0,
		};
	} catch {
		return null;
	}
}

function getColor(value: number): string {
	if (value >= 80) return "#4caf50"; // green
	if (value >= 65) return "#ff9800"; // orange
	return "#f44336"; // red
}

async function main(): Promise<void> {
	const data = await getCoverageData();
	const args = process.argv.slice(2);
	const outputFile = args.includes("--output") ? args[args.indexOf("--output") + 1] : null;

	if (!data) {
		console.error("coverage.json not found. Run `bun run test:unit:coverage` first.");
		process.exit(1);
	}

	const badges = [
		{
			name: "coverage.svg",
			content: generateBadge("coverage", data.lines.toFixed(1) + "%", getColor(data.lines)),
		},
		{
			name: "coverage-lines.svg",
			content: generateBadge("lines", data.lines.toFixed(1) + "%", getColor(data.lines)),
		},
		{
			name: "coverage-funcs.svg",
			content: generateBadge("funcs", data.funcs.toFixed(1) + "%", getColor(data.funcs)),
		},
		{
			name: "tests.svg",
			content: generateBadge(
				"tests",
				data.fail > 0 ? data.fail + " failing" : data.pass + " passing",
				data.fail > 0 ? "#f44336" : "#4caf50",
			),
		},
	];

	if (outputFile) {
		// Save specific badge
		const badge = badges.find((b) => b.name === outputFile);
		if (!badge) {
			console.error(`Unknown badge: ${outputFile}`);
			console.error(`Available: ${badges.map((b) => b.name).join(", ")}`);
			process.exit(1);
		}
		writeFileSync(outputFile, badge.content);
		console.log(`✓ Wrote ${outputFile}`);
	} else {
		// Display SVG URLs for markdown
		console.log(
			"\nAdd to README.md:\n" +
				"\n```markdown\n" +
				badges
					.map((b) => `![${b.name.replace(".svg", "")}](./coverage/${b.name})`)
					.join("\n") +
				"\n```\n",
		);

		// Create coverage directory and save all badges
		const fs = await import("node:fs/promises");
		try {
			await fs.mkdir("coverage", { recursive: true });
			for (const badge of badges) {
				await fs.writeFile(`coverage/${badge.name}`, badge.content);
				console.log(`✓ coverage/${badge.name}`);
			}
		} catch (err) {
			console.error("Failed to create coverage directory:", err);
		}
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
