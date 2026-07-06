import { spawn, type ChildProcess } from "node:child_process";

// Runs the Next app and the Cloudflare collab Worker side by side with one
// Ctrl-C, prefixed/colored log streams, and a readiness banner so it's obvious
// what came up where. See `dev:all` in package.json.

type TService = {
	key: string;
	label: string;
	color: string;
	command: readonly string[];
	// Once a line matches, we consider the service "ready" and capture the URL.
	readyPattern: RegExp;
	// What this service is, shown in the banner.
	blurb: string;
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";

const SERVICES: readonly TService[] = [
	{
		key: "app",
		label: "app   ",
		color: "\x1b[36m", // cyan
		command: ["bun", "run", "dev"],
		readyPattern: /(https?:\/\/(?:localhost|127\.0\.0\.1):\d+)/i,
		blurb: "Next.js (Turbopack) — the web app",
	},
	{
		key: "worker",
		label: "worker",
		color: "\x1b[35m", // magenta
		command: ["bun", "run", "party:dev"],
		readyPattern: /Ready on\s+(https?:\/\/[^\s]+)/i,
		blurb: "Cloudflare Worker — Yjs collab room (Durable Object)",
	},
] as const;

const procs: ChildProcess[] = [];
const ready = new Map<string, string>();
let shuttingDown = false;
let bannerShown = false;

function stamp(service: TService): string {
	return `${service.color}${BOLD}${service.label}${RESET} ${DIM}│${RESET} `;
}

function pipe(service: TService, stream: NodeJS.ReadableStream, isErr: boolean) {
	let buffer = "";
	stream.on("data", (chunk: Buffer) => {
		buffer += chunk.toString();
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			const out = isErr ? process.stderr : process.stdout;
			out.write(`${stamp(service)}${line}\n`);

			if (!ready.has(service.key)) {
				const match = line.match(service.readyPattern);
				if (match) {
					ready.set(service.key, match[1] ?? "started");
					console.log(
						`${stamp(service)}${GREEN}● ready${RESET} → ${ready.get(service.key)}`,
					);
					maybeBanner();
				}
			}
		}
	});
}

function maybeBanner() {
	if (bannerShown || ready.size < SERVICES.length) return;
	bannerShown = true;

	const appUrl = ready.get("app") ?? "http://localhost:3000";
	const workerUrl = ready.get("worker") ?? "http://localhost:8787";
	const width = 64;
	const bar = "─".repeat(width);

	console.log(`\n${GREEN}┌${bar}┐${RESET}`);
	console.log(`${GREEN}│${RESET} ${BOLD}Everything is up.${RESET}`);
	console.log(`${GREEN}│${RESET}`);
	console.log(`${GREEN}│${RESET} ${SERVICES[0].color}app${RESET}    ${appUrl}`);
	console.log(`${GREEN}│${RESET}        ${DIM}${SERVICES[0].blurb}${RESET}`);
	console.log(`${GREEN}│${RESET} ${SERVICES[1].color}worker${RESET} ${workerUrl}`);
	console.log(`${GREEN}│${RESET}        ${DIM}${SERVICES[1].blurb}${RESET}`);
	console.log(`${GREEN}│${RESET}`);
	console.log(
		`${GREEN}│${RESET} ${DIM}Collab only activates on a SHARED note (≥1 collaborator).${RESET}`,
	);
	console.log(
		`${GREEN}│${RESET} ${DIM}Open the same shared note in two sessions to see live sync.${RESET}`,
	);
	console.log(`${GREEN}│${RESET}`);
	console.log(`${GREEN}│${RESET} ${DIM}Ctrl-C stops both.${RESET}`);
	console.log(`${GREEN}└${bar}┘${RESET}\n`);
}

function shutdown(signal: NodeJS.Signals | "exit") {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`\n${DIM}Stopping all services (${signal})…${RESET}`);
	for (const proc of procs) {
		if (!proc.killed) proc.kill("SIGTERM");
	}
}

console.log(`${BOLD}Starting ${SERVICES.length} services…${RESET}`);
for (const service of SERVICES) {
	console.log(`${stamp(service)}${DIM}spawning${RESET} ${service.command.join(" ")}`);
}
console.log("");

for (const service of SERVICES) {
	const proc = spawn(service.command[0], service.command.slice(1), {
		env: process.env,
		stdio: ["inherit", "pipe", "pipe"],
	});
	procs.push(proc);

	if (proc.stdout) pipe(service, proc.stdout, false);
	if (proc.stderr) pipe(service, proc.stderr, true);

	proc.on("error", (error) => {
		console.error(`${stamp(service)}${RED}failed to start:${RESET} ${error.message}`);
		shutdown("exit");
	});

	proc.on("close", (code) => {
		// One service dying takes the whole dev session down — they're meant to run
		// as a pair, and a half-up state is more confusing than a clean exit.
		if (!shuttingDown) {
			const tone = code === 0 ? DIM : RED;
			console.log(`${stamp(service)}${tone}exited (code ${code ?? 0})${RESET}`);
			shutdown("exit");
		}
	});
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
