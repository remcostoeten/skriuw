import fs from "node:fs/promises";
import path from "node:path";

type CLSResult = {
	selector: string;
	skeleton: { x: number; y: number; width: number; height: number; exists: boolean };
	loaded: { x: number; y: number; width: number; height: number; exists: boolean };
	deltaX: number;
	deltaY: number;
	deltaWidth: number;
	deltaHeight: number;
	shifted: boolean;
};

type RouteReport = {
	route: string;
	viewport: string;
	cls: CLSResult[];
	diffPercentage: number;
	passed: boolean;
};

async function findReports(dir: string): Promise<RouteReport[]> {
	const reports: RouteReport[] = [];

	async function walk(current: string) {
		const entries = await fs.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (entry.name === "report.json") {
				const content = await fs.readFile(fullPath, "utf8");
				reports.push(JSON.parse(content));
			}
		}
	}

	await walk(dir);
	return reports;
}

function suggestFix(cls: CLSResult): string {
	if (!cls.skeleton.exists && cls.loaded.exists) {
		return `${cls.selector} exists in the loaded state but is missing from the fallback shell.`;
	}
	if (cls.skeleton.exists && !cls.loaded.exists) {
		return `${cls.selector} appears in the fallback but not in the loaded state.`;
	}
	if (cls.deltaHeight > 50) {
		return `Skeleton height for ${cls.selector} is off by ${cls.deltaHeight}px.`;
	}
	if (cls.deltaWidth > 20) {
		return `Skeleton width for ${cls.selector} is off by ${cls.deltaWidth}px.`;
	}
	if (cls.deltaY > 10) {
		return `${cls.selector} shifts ${cls.deltaY}px vertically.`;
	}
	if (cls.deltaX > 10) {
		return `${cls.selector} shifts ${cls.deltaX}px horizontally.`;
	}
	return `${cls.selector} shifted slightly.`;
}

function formatReport(reports: RouteReport[]): string {
	const passed = reports.filter((report) => report.passed).length;
	const failed = reports.length - passed;
	const lines = [
		"=== SKELETON QA REPORT ===",
		`PASSED: ${passed}/${reports.length}  FAILED: ${failed}/${reports.length}`,
		"",
	];

	reports
		.toSorted((left, right) => {
			if (left.passed !== right.passed) return left.passed ? 1 : -1;
			return `${left.viewport}${left.route}`.localeCompare(`${right.viewport}${right.route}`);
		})
		.forEach((report) => {
			const status = report.passed ? "PASS" : "FAIL";
			const diffPct = (report.diffPercentage * 100).toFixed(1);
			const violations = report.cls.filter((result) => result.shifted);
			lines.push(`--- ${status} [${report.viewport}] ${report.route} (${diffPct}% pixel diff) ---`);

			if (violations.length === 0 && report.diffPercentage < 0.05) {
				lines.push("  No issues.");
			}

			for (const violation of violations) {
				lines.push(
					`  SHIFT: ${violation.selector} moved (${violation.deltaX}px, ${violation.deltaY}px), size changed (${violation.deltaWidth}px, ${violation.deltaHeight}px)`,
				);
				lines.push(`    Fix: ${suggestFix(violation)}`);
			}

			if (report.diffPercentage >= 0.05 && violations.length === 0) {
				lines.push(`  DIFF: ${diffPct}% pixel difference exceeds 5% threshold.`);
				lines.push("    Fix: Check the relevant Suspense fallback shell structure.");
			}

			lines.push("");
		});

	return lines.join("\n");
}

const resultsDir = process.argv[2] ?? path.join(process.cwd(), "test-results", "skeleton-qa");

try {
	const reports = await findReports(resultsDir);
	if (reports.length === 0) {
		console.error("No report.json files found in", resultsDir);
		process.exit(1);
	}

	await fs.writeFile(
		path.join(resultsDir, "combined-report.json"),
		JSON.stringify(reports, null, 2),
	);
	console.log(formatReport(reports));
} catch (error) {
	console.error(error);
	process.exit(1);
}
