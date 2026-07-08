import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const REPORTS_DIR = path.resolve(import.meta.dirname, "react-doctor-reports");

type Severity = "error" | "warning";

type Diagnostic = {
	filePath: string;
	plugin: string;
	rule: string;
	severity: Severity;
	message: string;
	title?: string;
	help?: string;
	line: number;
	column: number;
	category: string;
};

type ProjectSummary = {
	projectName: string;
	score: number;
	label: string;
	errors: number;
	warnings: number;
	byCategory: Record<string, number>;
	scannedFiles: number;
};

type Report = {
	createdAt: string;
	version: string;
	projects: ProjectSummary[];
};

function exec(cmd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn(cmd, args, {
			stdio: ["ignore", "pipe", "pipe"],
			shell: true,
		});
		let out = "";
		let err = "";
		proc.stdout.on("data", (chunk) => {
			out += chunk;
		});
		proc.stderr.on("data", (chunk) => {
			err += chunk;
		});
		proc.on("close", (code) => {
			if (code === 0 || code === 1) resolve(out);
			else reject(new Error(`Exit code ${code}: ${err}`));
		});
		proc.on("error", reject);
	});
}

async function getPreviousReports(): Promise<{ filename: string; report: Report }[]> {
	try {
		const files = await readdir(REPORTS_DIR);
		const jsonFiles = files
			.filter((f) => f.endsWith(".json") && f !== "latest.json")
			.sort()
			.reverse();
		const results: { filename: string; report: Report }[] = [];
		for (const f of jsonFiles.slice(0, 5)) {
			try {
				const content = await readFile(path.join(REPORTS_DIR, f), "utf-8");
				results.push({ filename: f, report: JSON.parse(content) as Report });
			} catch {
				/* skip corrupt */
			}
		}
		return results;
	} catch {
		return [];
	}
}

function formatDiff(current: ProjectSummary, previous?: ProjectSummary): string {
	if (!previous) return "";
	const scoreDiff = current.score - previous.score;
	const errDiff = current.errors - previous.errors;
	const warnDiff = current.warnings - previous.warnings;

	const parts: string[] = [];
	if (scoreDiff !== 0) {
		parts.push(scoreDiff > 0 ? `+${scoreDiff} pts` : `${scoreDiff} pts`);
	}
	if (errDiff !== 0) {
		parts.push(errDiff > 0 ? `+${errDiff} err` : `${errDiff} err`);
	}
	if (warnDiff !== 0) {
		parts.push(warnDiff > 0 ? `+${warnDiff} warn` : `${warnDiff} warn`);
	}
	if (parts.length === 0) return " (no change)";
	const arrow = scoreDiff > 0 || (scoreDiff === 0 && errDiff <= 0 && warnDiff <= 0) ? "↑" : "↓";
	return ` (${arrow} ${parts.join(", ")})`;
}

function fmt(n: number): string {
	return n.toString().padStart(3);
}

function renderReport(report: Report, previous?: Report): string {
	const lines: string[] = [];
	const date = new Date(report.createdAt);
	lines.push(`# React Doctor Report`);
	lines.push(`**Run:** ${date.toISOString().replace("T", " ").slice(0, 19)}`);
	lines.push(`**Version:** ${report.version}`);
	lines.push("");

	for (const proj of report.projects) {
		const prev = previous?.projects.find((p) => p.projectName === proj.projectName);
		const diff = formatDiff(proj, prev);

		const cats = Object.entries(proj.byCategory)
			.sort((a, b) => b[1] - a[1])
			.map(([cat, count]) => `${cat}: ${count}`)
			.join(" | ");

		lines.push(`## ${proj.projectName} — **${proj.score}/100** ${proj.label}${diff}`);
		lines.push(`| Metric | Count |`);
		lines.push(`|---|---|`);
		lines.push(`| Errors | ${proj.errors} |`);
		lines.push(`| Warnings | ${proj.warnings} |`);
		lines.push(`| Files scanned | ${proj.scannedFiles} |`);
		lines.push(`| By category | ${cats} |`);
		lines.push("");
	}

	const overallScore = Math.round(
		report.projects.reduce((s, p) => s + p.score, 0) / report.projects.length,
	);
	const totalErrors = report.projects.reduce((s, p) => s + p.errors, 0);
	const totalWarnings = report.projects.reduce((s, p) => s + p.warnings, 0);
	const prevOverallScore = previous
		? Math.round(previous.projects.reduce((s, p) => s + p.score, 0) / previous.projects.length)
		: null;
	const prevTotalErrors = previous ? previous.projects.reduce((s, p) => s + p.errors, 0) : null;
	const prevTotalWarnings = previous
		? previous.projects.reduce((s, p) => s + p.warnings, 0)
		: null;

	lines.push(`---`);
	lines.push(`### Summary`);
	lines.push(`| Metric | This run | Previous | Change |`);
	lines.push(`|---|---|---|---|`);
	const sDiff =
		prevOverallScore !== null
			? `${overallScore - prevOverallScore > 0 ? "+" : ""}${overallScore - prevOverallScore}`
			: "—";
	lines.push(`| Avg score | ${overallScore} | ${prevOverallScore ?? "—"} | ${sDiff} |`);
	const eDiff =
		prevTotalErrors !== null
			? `${totalErrors - prevTotalErrors > 0 ? "+" : ""}${totalErrors - prevTotalErrors}`
			: "—";
	lines.push(`| Total errors | ${totalErrors} | ${prevTotalErrors ?? "—"} | ${eDiff} |`);
	const wDiff =
		prevTotalWarnings !== null
			? `${totalWarnings - prevTotalWarnings > 0 ? "+" : ""}${totalWarnings - prevTotalWarnings}`
			: "—";
	lines.push(`| Total warnings | ${totalWarnings} | ${prevTotalWarnings ?? "—"} | ${wDiff} |`);

	return lines.join("\n");
}

async function main() {
	await mkdir(REPORTS_DIR, { recursive: true });

	const raw = await exec("bunx", ["react-doctor", "--json"]);

	const data = JSON.parse(raw);

	const report: Report = {
		createdAt: new Date().toISOString(),
		version: data.version,
		projects: data.projects.map(
			(p: {
				project: { projectName: string };
				score: { score: number; label: string };
				diagnostics: Diagnostic[];
				scannedFileCount: number;
			}) => {
				let errors = 0;
				let warnings = 0;
				const byCategory: Record<string, number> = {};
				for (const d of p.diagnostics) {
					if (d.severity === "error") errors++;
					else warnings++;
					byCategory[d.category] = (byCategory[d.category] || 0) + 1;
				}
				return {
					projectName: p.project.projectName,
					score: p.score.score,
					label: p.score.label,
					errors,
					warnings,
					byCategory,
					scannedFiles: p.scannedFileCount,
				};
			},
		),
	};

	const prev = await getPreviousReports();
	const previous = prev.length > 0 ? prev[0].report : undefined;

	const timestamp = report.createdAt.replace(/[:.]/g, "-").slice(0, 19);
	const filename = `report-${timestamp}.json`;
	await writeFile(path.join(REPORTS_DIR, filename), JSON.stringify(report, null, 2));
	await writeFile(path.join(REPORTS_DIR, "latest.json"), JSON.stringify(report, null, 2));

	const md = renderReport(report, previous);
	const mdFilename = `report-${timestamp}.md`;
	const mdPath = path.join(REPORTS_DIR, mdFilename);
	await writeFile(mdPath, md + "\n");

	await writeFile(path.join(REPORTS_DIR, "latest.md"), md + "\n");

	console.log(md);

	console.log(`\n📄 Full JSON:   ${path.join(REPORTS_DIR, filename)}`);
	console.log(`📄 Markdown:    ${mdPath}`);
	console.log(`📄 Latest:      ${path.join(REPORTS_DIR, "latest.md")}`);

	if (previous) {
		console.log(`\nPrevious run:  ${prev[0].filename}`);
	}
}

main().catch((err) => {
	console.error("react-doctor-report failed:", err.message);
	process.exit(1);
});
