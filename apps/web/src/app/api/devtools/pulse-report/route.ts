import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

interface Component {
	name: string;
	renders: number;
	wasted: number;
	timed: number;
	selfTotal: number;
	lastReason: string;
}

interface Commit {
	id: number;
	total: number;
}

interface LogEntry {
	name: string;
	reason: string;
}

interface Payload {
	url?: string;
	components?: Component[];
	commits?: Commit[];
	logs?: LogEntry[];
}

function avgSelf(entry: Component): number | null {
	return entry.timed ? entry.selfTotal / entry.timed : null;
}

function table(rows: string[][], header: string[]): string {
	const head = `| ${header.join(" | ")} |`;
	const divider = `| ${header.map(() => "---").join(" | ")} |`;
	const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
	return `${head}\n${divider}\n${body}`;
}

function buildReport(payload: Payload, generatedAt: string): string {
	const components = payload.components ?? [];
	const commits = payload.commits ?? [];
	const logs = payload.logs ?? [];

	const totalRenders = components.reduce((sum, c) => sum + c.renders, 0);
	const totalWasted = components.reduce((sum, c) => sum + c.wasted, 0);

	const byRenders = [...components].sort((a, b) => b.renders - a.renders).slice(0, 15);
	const byWasted = [...components]
		.filter((c) => c.wasted > 0)
		.sort((a, b) => b.wasted - a.wasted)
		.slice(0, 15);
	const bySelf = [...components]
		.filter((c) => avgSelf(c) !== null)
		.sort((a, b) => (avgSelf(b) ?? 0) - (avgSelf(a) ?? 0))
		.slice(0, 15);

	const fpsDrops = logs.filter((l) => /fps dropped|long task/i.test(l.reason)).slice(-20);
	const heaviestCommits = [...commits].sort((a, b) => b.total - a.total).slice(0, 10);

	const lines: string[] = [];
	lines.push("# Pulse render report");
	lines.push("");
	lines.push(`Generated: ${generatedAt}`);
	if (payload.url) {
		lines.push(`Page: ${payload.url}`);
	}
	lines.push("");
	lines.push(
		`Tracked ${components.length} components across ${commits.length} commits — ${totalRenders} total renders, ${totalWasted} wasted (parent re-rendered, props identical → memo candidates).`,
	);
	lines.push("");

	lines.push("## Most-rendered components");
	lines.push("");
	lines.push(
		table(
			byRenders.map((c) => [
				c.name,
				String(c.renders),
				String(c.wasted),
				avgSelf(c) !== null ? `${avgSelf(c)!.toFixed(2)}ms` : "—",
				(c.lastReason || "—").replace(/\|/g, String.raw`\|`),
			]),
			["Component", "Renders", "Wasted", "Avg self", "Last reason"],
		),
	);
	lines.push("");

	if (byWasted.length) {
		lines.push("## Wasted renders (memoization candidates)");
		lines.push("");
		lines.push(
			"These re-rendered while their props were referentially identical — usually a missing `memo`, an unstable prop identity, or context churn upstream.",
		);
		lines.push("");
		lines.push(
			table(
				byWasted.map((c) => [
					c.name,
					String(c.wasted),
					String(c.renders),
					`${Math.round((c.wasted / c.renders) * 100)}%`,
				]),
				["Component", "Wasted", "Renders", "Waste share"],
			),
		);
		lines.push("");
	}

	if (bySelf.length) {
		lines.push("## Slowest components (avg self time)");
		lines.push("");
		lines.push(
			table(
				bySelf.map((c) => [c.name, `${avgSelf(c)!.toFixed(2)}ms`, String(c.renders)]),
				["Component", "Avg self", "Renders"],
			),
		);
		lines.push("");
	}

	if (heaviestCommits.length) {
		lines.push("## Heaviest commits (components rendered per commit)");
		lines.push("");
		lines.push(
			heaviestCommits
				.map((c) => `- commit #${c.id}: ${c.total} components rendered`)
				.join("\n"),
		);
		lines.push("");
	}

	if (fpsDrops.length) {
		lines.push("## Frame drops & long tasks");
		lines.push("");
		lines.push(fpsDrops.map((l) => `- ${l.name}: ${l.reason}`).join("\n"));
		lines.push("");
	}

	lines.push("## How to read this");
	lines.push("");
	lines.push(
		"- **Wasted renders** are the cheapest wins: wrap the component in `memo` or stabilize the offending prop (`useMemo`/`useCallback`, or move the value out of render).",
	);
	lines.push(
		"- A component with high **renders** and an unstable **last reason** (`changed by reference`) points at a prop or context value being recreated every render upstream.",
	);
	lines.push(
		"- High **avg self time** with low renders means the component itself is expensive — look at what it computes, not how often it runs.",
	);

	return `${lines.join("\n")}\n`;
}

export async function POST(request: NextRequest) {
	const devtoolsAllowed =
		process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEVTOOLS === "true";
	if (!devtoolsAllowed) {
		return NextResponse.json({ error: "not available in production" }, { status: 404 });
	}

	let payload: Payload;
	try {
		payload = (await request.json()) as Payload;
	} catch {
		return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
	}

	const generatedAt = new Date().toISOString();
	const report = buildReport(payload, generatedAt);
	const dir = path.join(process.cwd(), ".pulse");
	const file = path.join(dir, "report.md");

	try {
		await mkdir(dir, { recursive: true });
		await writeFile(file, report, "utf8");
	} catch (error) {
		return NextResponse.json(
			{ error: `failed to write report: ${String(error)}` },
			{ status: 500 },
		);
	}

	return NextResponse.json({ path: path.relative(process.cwd(), file) });
}
