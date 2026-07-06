import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

type CoverageRow = {
	file: string;
	funcs: number;
	lines: number;
	uncovered: string;
};

type Summary = {
	pass: number;
	fail: number;
	expects: number;
	tests: number;
	files: number;
	duration: string;
};

type Failure = {
	title: string;
};

type ParsedRun = {
	overall: CoverageRow | null;
	rows: CoverageRow[];
	summary: Summary;
	failures: Failure[];
	raw: string[];
};

type SortMode = "file" | "worst";
type ViewMode = "coverage" | "failures" | "log";

const ESC = "\x1b";
const HEADER_HEIGHT = 3;
const FOOTER_HEIGHT = 3;

const WEB_DIR = path.join(import.meta.dirname, "..", "apps", "web");
const TEST_ARGS = ["test", "--coverage", "--isolate", "__tests__"];

function color(code: number, text: string): string {
	return `${ESC}[${code}m${text}${ESC}[0m`;
}

function dim(text: string): string {
	return color(2, text);
}

function bold(text: string): string {
	return `${ESC}[1m${text}${ESC}[0m`;
}

function pctColor(value: number, text: string): string {
	if (value >= 80) return color(32, text);
	if (value >= 50) return color(33, text);
	return color(31, text);
}

function pad(text: string, width: number): string {
	if (text.length >= width) return text.slice(0, width);
	return text + " ".repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
	if (text.length >= width) return text.slice(0, width);
	return " ".repeat(width - text.length) + text;
}

function truncate(text: string, width: number): string {
	if (text.length <= width) return text;
	if (width <= 1) return text.slice(0, width);
	return text.slice(0, width - 1) + "…";
}

function parseRun(raw: string): ParsedRun {
	const lines = raw.split("\n");
	const rows: CoverageRow[] = [];
	const failures: Failure[] = [];
	let overall: CoverageRow | null = null;

	const rowPattern = /^\s*(\S.*?)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|(.*)$/;
	let inTable = false;

	for (const line of lines) {
		if (/^\s*File\s+\|\s+% Funcs\s+\|\s+% Lines/.test(line)) {
			inTable = true;
			continue;
		}
		const failMatch = line.match(/^\(fail\)\s+(.+?)(?:\s+\[[\d.]+m?s\])?$/);
		if (failMatch) failures.push({ title: failMatch[1].trim() });

		if (!inTable) continue;
		if (/^-+\|/.test(line) || /^-{5,}/.test(line)) continue;
		const match = line.match(rowPattern);
		if (!match) continue;
		const row: CoverageRow = {
			file: match[1].trim(),
			funcs: Number.parseFloat(match[2]),
			lines: Number.parseFloat(match[3]),
			uncovered: match[4].trim(),
		};
		if (row.file === "All files") overall = row;
		else rows.push(row);
	}

	const pass = Number(raw.match(/(\d+)\s+pass/)?.[1] ?? 0);
	const fail = Number(raw.match(/(\d+)\s+fail/)?.[1] ?? 0);
	const expects = Number(raw.match(/(\d+)\s+expect\(\)/)?.[1] ?? 0);
	const ranMatch = raw.match(/Ran\s+(\d+)\s+tests across\s+(\d+)\s+files\.\s*\[([\d.]+m?s)\]/);

	const summary: Summary = {
		pass,
		fail,
		expects,
		tests: Number(ranMatch?.[1] ?? pass + fail),
		files: Number(ranMatch?.[2] ?? 0),
		duration: ranMatch?.[3] ?? "?",
	};

	return { overall, rows, summary, failures, raw: lines };
}

function runCoverage(): Promise<ParsedRun> {
	return new Promise((resolve, reject) => {
		const child = spawn("bun", TEST_ARGS, {
			cwd: WEB_DIR,
			env: process.env,
		});
		let out = "";
		const collect = (chunk: Buffer) => {
			out += chunk.toString();
		};
		child.stdout.on("data", collect);
		child.stderr.on("data", collect);
		child.on("error", reject);
		child.on("close", () => resolve(parseRun(out)));
	});
}

function bar(value: number, width: number): string {
	const filled = Math.round((value / 100) * width);
	const track = "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
	return pctColor(value, track);
}

class Screen {
	private run: ParsedRun;
	private offset = 0;
	private sort: SortMode = "file";
	private view: ViewMode = "coverage";
	private loading = false;
	private status = "";

	constructor(run: ParsedRun) {
		this.run = run;
	}

	private get cols(): number {
		return process.stdout.columns ?? 80;
	}

	private get rows(): number {
		return process.stdout.rows ?? 24;
	}

	private get bodyHeight(): number {
		return Math.max(1, this.rows - HEADER_HEIGHT - FOOTER_HEIGHT);
	}

	private sortedRows(): CoverageRow[] {
		const copy = [...this.run.rows];
		if (this.sort === "worst") copy.sort((a, b) => a.lines - b.lines);
		else copy.sort((a, b) => a.file.localeCompare(b.file));
		return copy;
	}

	private bodyLines(): string[] {
		if (this.view === "log") return this.run.raw;
		if (this.view === "failures") {
			if (this.run.failures.length === 0) return [color(32, "  No failing tests. 🎉")];
			return this.run.failures.map(
				(f, i) => `  ${dim(padLeft(String(i + 1), 3))}  ${color(31, "✗")} ${f.title}`,
			);
		}

		const width = this.cols;
		const pctW = 7;
		const barW = 8;
		const gap = 2;
		const fileW = Math.max(20, Math.floor((width - (pctW + gap) * 2 - barW - gap - 20) * 0.55));
		const uncoveredW = Math.max(6, width - fileW - (pctW + gap) * 2 - barW - gap - 2);

		const head =
			"  " +
			bold(pad("File", fileW)) +
			"  " +
			bold(padLeft("Funcs", pctW)) +
			"  " +
			bold(padLeft("Lines", pctW)) +
			"  " +
			bold(pad("", barW)) +
			"  " +
			bold(pad("Uncovered", uncoveredW));

		const body = this.sortedRows().map((r) => {
			const funcs = padLeft(r.funcs.toFixed(1) + "%", pctW);
			const linesTxt = padLeft(r.lines.toFixed(1) + "%", pctW);
			return (
				"  " +
				pad(truncate(r.file, fileW), fileW) +
				"  " +
				pctColor(r.funcs, funcs) +
				"  " +
				pctColor(r.lines, linesTxt) +
				"  " +
				bar(r.lines, barW) +
				"  " +
				dim(truncate(r.uncovered, uncoveredW))
			);
		});

		return [head, ""].concat(body);
	}

	private renderHeader(): string[] {
		const width = this.cols;
		const o = this.run.overall;
		const title = bold(" skriuw ") + dim("· unit test coverage");
		const meta = this.loading
			? color(33, "running…")
			: dim(
					`${this.run.summary.tests} tests · ${this.run.summary.files} files · ${this.run.summary.duration}`,
				);
		const line1 =
			title + " ".repeat(Math.max(1, width - stripLen(title) - stripLen(meta) - 1)) + meta;

		let line2 = dim(" overall");
		if (o) {
			line2 =
				dim("  overall  ") +
				dim("funcs ") +
				pctColor(o.funcs, o.funcs.toFixed(1) + "%") +
				dim("  lines ") +
				pctColor(o.lines, o.lines.toFixed(1) + "%") +
				"  " +
				bar(o.lines, Math.max(10, Math.min(40, width - 40)));
		}
		return [line1, line2, color(90, "─".repeat(width))];
	}

	private renderFooter(): string[] {
		const width = this.cols;
		const s = this.run.summary;
		const passTxt = color(32, `${s.pass} pass`);
		const failTxt = s.fail > 0 ? color(31, `${s.fail} fail`) : dim("0 fail");
		const stats = `  ${passTxt}  ${failTxt}  ${dim(`${s.expects} expect() calls`)}`;
		const status = this.status ? color(36, this.status) : "";
		const statsLine =
			stats +
			" ".repeat(Math.max(1, width - stripLen(stats) - stripLen(status) - 1)) +
			status;

		const active = (mode: string, label: string) =>
			this.viewLabelActive(mode) ? bold(label) : dim(label);
		const keys = [
			dim("↑↓/jk scroll"),
			dim("PgUp/PgDn"),
			`${active("sort", `s sort:${this.sort}`)}`,
			`${active("coverage", "c coverage")}`,
			`${active("failures", "f failures")}`,
			`${active("log", "l log")}`,
			dim("r rerun"),
			dim("q quit"),
		].join(dim("  ·  "));
		return [color(90, "─".repeat(width)), statsLine, " " + keys];
	}

	private viewLabelActive(mode: string): boolean {
		if (mode === "sort") return false;
		return this.view === mode;
	}

	render(): void {
		const lines: string[] = [];
		lines.push(...this.renderHeader());

		const body = this.bodyLines();
		const maxOffset = Math.max(0, body.length - this.bodyHeight);
		if (this.offset > maxOffset) this.offset = maxOffset;
		const slice = body.slice(this.offset, this.offset + this.bodyHeight);
		while (slice.length < this.bodyHeight) slice.push("");
		lines.push(...slice);

		lines.push(...this.renderFooter());

		const width = this.cols;
		const painted = lines.map((l) => clip(l, width) + `${ESC}[0m${ESC}[K`);
		const out = `${ESC}[H` + painted.join("\n") + `${ESC}[J`;
		process.stdout.write(out);
	}

	scroll(delta: number): void {
		this.offset = Math.max(0, this.offset + delta);
		this.render();
	}

	setView(view: ViewMode): void {
		this.view = view;
		this.offset = 0;
		this.render();
	}

	toggleSort(): void {
		this.sort = this.sort === "file" ? "worst" : "file";
		this.offset = 0;
		this.render();
	}

	async rerun(): Promise<void> {
		this.loading = true;
		this.status = "re-running tests…";
		this.render();
		this.run = await runCoverage();
		this.loading = false;
		this.status = "";
		this.offset = 0;
		this.render();
	}

	page(dir: number): void {
		this.scroll(dir * (this.bodyHeight - 1));
	}

	get failCount(): number {
		return this.run.summary.fail;
	}
}

function stripLen(text: string): number {
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function clip(text: string, maxWidth: number): string {
	let visible = 0;
	let out = "";
	let i = 0;
	while (i < text.length) {
		if (text[i] === ESC) {
			// eslint-disable-next-line no-control-regex
			const match = text.slice(i).match(/^\x1b\[[0-9;]*m/);
			if (match) {
				out += match[0];
				i += match[0].length;
				continue;
			}
		}
		if (visible >= maxWidth) break;
		out += text[i];
		visible += 1;
		i += 1;
	}
	return out;
}

type ReportOptions = {
	report: boolean;
	json: string | null;
	markdown: boolean;
	markdownPath: string | null;
	threshold: number | null;
};

function parseArgs(argv: string[]): ReportOptions {
	const opts: ReportOptions = {
		report: false,
		json: null,
		markdown: false,
		markdownPath: null,
		threshold: null,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--report") opts.report = true;
		else if (arg === "--markdown") {
			opts.markdown = true;
			// Accept a space-separated path (`--markdown coverage.md`) the same way
			// `--json` does; a bare `--markdown` still writes to stdout.
			const next = argv[i + 1];
			if (next && !next.startsWith("--")) opts.markdownPath = argv[++i];
		} else if (arg.startsWith("--markdown=")) {
			opts.markdown = true;
			opts.markdownPath = arg.slice("--markdown=".length);
		} else if (arg === "--json") opts.json = argv[++i] ?? "coverage.json";
		else if (arg.startsWith("--json=")) opts.json = arg.slice("--json=".length);
		else if (arg.startsWith("--threshold="))
			opts.threshold = Number.parseFloat(arg.slice("--threshold=".length));
	}
	if (opts.json || opts.markdown) opts.report = true;
	return opts;
}

function toMarkdown(run: ParsedRun): string {
	const { summary: s, overall: o } = run;
	const out: string[] = ["### 🧪 Unit test coverage", ""];
	const status = s.fail > 0 ? `❌ **${s.fail} failing**` : "✅ **all passing**";
	out.push(
		`${status} — ${s.pass} passed, ${s.tests} tests across ${s.files} files in ${s.duration}.`,
		"",
	);
	if (o)
		out.push(
			`**Overall coverage:** ${o.funcs.toFixed(1)}% funcs · ${o.lines.toFixed(1)}% lines`,
			"",
		);

	if (run.failures.length > 0) {
		out.push("<details><summary>Failing tests</summary>", "");
		for (const f of run.failures) out.push(`- \`${f.title}\``);
		out.push("", "</details>", "");
	}

	const worst = [...run.rows].sort((a, b) => a.lines - b.lines).slice(0, 15);
	out.push(
		"<details><summary>Lowest-covered files</summary>",
		"",
		"| File | Funcs | Lines |",
		"| --- | ---: | ---: |",
	);
	for (const r of worst)
		out.push(`| \`${r.file}\` | ${r.funcs.toFixed(1)}% | ${r.lines.toFixed(1)}% |`);
	out.push("", "</details>");
	return out.join("\n");
}

async function runReport(opts: ReportOptions): Promise<void> {
	const run = await runCoverage();
	process.stderr.write(run.raw.join("\n") + "\n");

	if (opts.json) {
		const payload = {
			generatedAt: new Date().toISOString(),
			summary: run.summary,
			overall: run.overall,
			files: run.rows,
			failures: run.failures,
		};
		await writeFile(opts.json, JSON.stringify(payload, null, 2) + "\n");
		process.stderr.write(`\ncoverage report written → ${opts.json}\n`);
	}

	if (opts.markdown) {
		const md = toMarkdown(run) + "\n";
		if (opts.markdownPath) await writeFile(opts.markdownPath, md);
		else process.stdout.write(md);
	}

	let code = run.summary.fail > 0 ? 1 : 0;
	if (opts.threshold != null && run.overall && run.overall.lines < opts.threshold) {
		process.stderr.write(
			`coverage ${run.overall.lines.toFixed(1)}% below threshold ${opts.threshold}%\n`,
		);
		if (code === 0) code = 2;
	}
	process.exit(code);
}

function enterAltScreen(): void {
	process.stdout.write(`${ESC}[?1049h${ESC}[?25l`);
}

function exitAltScreen(): void {
	process.stdout.write(`${ESC}[?25h${ESC}[?1049l`);
}

async function main(): Promise<void> {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.report) {
		await runReport(opts);
		return;
	}

	if (!process.stdout.isTTY) {
		const run = await runCoverage();
		process.stdout.write(run.raw.join("\n") + "\n");
		process.exit(run.summary.fail > 0 ? 1 : 0);
	}

	process.stdout.write("Running coverage… this can take a moment.\n");
	const run = await runCoverage();
	const screen = new Screen(run);

	enterAltScreen();
	const cleanup = () => {
		exitAltScreen();
		if (process.stdin.isTTY) process.stdin.setRawMode(false);
	};

	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdout.on("resize", () => screen.render());
	screen.render();

	process.stdin.on("data", async (data: Buffer) => {
		const key = data.toString();
		if (key === "q" || key === "\x03") {
			cleanup();
			process.exit(screen.failCount > 0 ? 1 : 0);
		} else if (key === "\x1b[A" || key === "k") screen.scroll(-1);
		else if (key === "\x1b[B" || key === "j") screen.scroll(1);
		else if (key === "\x1b[5~") screen.page(-1);
		else if (key === "\x1b[6~") screen.page(1);
		else if (key === "\x1b[H" || key === "g") screen.scroll(-1e9);
		else if (key === "\x1b[F" || key === "G") screen.scroll(1e9);
		else if (key === "s") screen.toggleSort();
		else if (key === "c") screen.setView("coverage");
		else if (key === "f") screen.setView("failures");
		else if (key === "l") screen.setView("log");
		else if (key === "r") await screen.rerun();
	});

	process.on("SIGINT", () => {
		cleanup();
		process.exit(130);
	});
}

main();
