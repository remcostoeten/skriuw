import { spawn } from "node:child_process";

const steps = [
  {
    label: "Unit tests",
    command: ["bun", "run", "test:unit"],
  },
  {
    label: "Production build",
    command: ["bun", "run", "build"],
  },
] as const;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function printHeader(title: string) {
  const line = "=".repeat(title.length + 8);
  console.log(`\n${line}`);
  console.log(`=== ${title} ===`);
  console.log(line);
}

async function runStep(index: number, total: number, label: string, command: readonly string[]) {
  const humanCommand = command.join(" ");
  printHeader(`${index + 1}/${total} ${label}`);
  console.log(humanCommand);

  const startedAt = performance.now();
  const code = await new Promise<number>((resolve, reject) => {
    const proc = spawn(command[0], command.slice(1), {
      stdio: "inherit",
      env: process.env,
    });

    proc.on("error", reject);
    proc.on("close", (exitCode) => resolve(exitCode ?? 1));
  });
  const elapsed = formatDuration(performance.now() - startedAt);

  if (code !== 0) {
    console.log(`\n${label} failed after ${elapsed}.`);
    process.exit(code);
  }

  console.log(`\n${label} completed in ${elapsed}.`);
}

const overallStartedAt = performance.now();
printHeader("Verified Build");
console.log("Tests run before build. Output is streamed live.");

for (const [index, step] of steps.entries()) {
  await runStep(index, steps.length, step.label, step.command);
}

console.log(`\nAll steps completed in ${formatDuration(performance.now() - overallStartedAt)}.`);
