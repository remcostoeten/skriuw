#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const EM_DASH = "—";

async function main() {
	const files = process.argv.slice(2);
	const offenders = [];

	for (const file of files) {
		const text = await readFile(file, "utf8");
		const lines = text.split("\n");
		lines.forEach((line, index) => {
			if (line.includes(EM_DASH)) {
				offenders.push(`${file}:${index + 1}: ${line.trim()}`);
			}
		});
	}

	if (offenders.length > 0) {
		console.error("Em-dashes are not allowed in documentation content. Use a hyphen or reword:\n");
		console.error(offenders.join("\n"));
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
