import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { cpus, hostname, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = join(root, "app");
const binary = join(app, "src-tauri/target/debug/skriuw-app");
const fixture = join(root, "fixtures/import-samples/notion-export.zip");
const driverBaseUrl = "http://127.0.0.1:4444";
const skipBuild = process.argv.includes("--skip-build");
const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  root,
  outputIndex >= 0
    ? (process.argv[outputIndex + 1] ?? "app/e2e/results/native-latest.json")
    : "app/e2e/results/native-latest.json",
);
const KEY = { control: "\uE009", enter: "\uE007", escape: "\uE00C" };
const sleep = (milliseconds) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

function noop() {}

function run(command, arguments_, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd ?? root,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${arguments_.join(" ")} failed (${code})\n${stderr}`));
      }
    });
  });
}

async function driverRequest(method, path, body) {
  const response = await fetch(`${driverBaseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed (${response.status}): ${JSON.stringify(payload.value ?? payload)}`,
    );
  }
  return payload.value;
}

function makeSession(sessionId) {
  async function script(expression, arguments_ = []) {
    return driverRequest("POST", `/session/${sessionId}/execute/sync`, {
      script: expression,
      args: arguments_,
    });
  }
  async function keys(sequence) {
    const actions = sequence.flatMap((entry) =>
      entry.hold
        ? [{ type: "keyDown", value: entry.hold }]
        : entry.release
          ? [{ type: "keyUp", value: entry.release }]
          : [...entry.type].flatMap((character) => [
              { type: "keyDown", value: character },
              { type: "keyUp", value: character },
            ]),
    );
    await driverRequest("POST", `/session/${sessionId}/actions`, {
      actions: [{ type: "key", id: "keyboard", actions }],
    });
  }
  async function waitFor(expression, description, attempts = 200) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (await script(expression)) {
        return;
      }
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${description}`);
  }
  return {
    script,
    keys,
    waitFor,
    close: () => driverRequest("DELETE", `/session/${sessionId}`),
  };
}

function launchDriver(workspaceDirectory) {
  const child = spawn(
    "tauri-driver",
    [
      "--native-driver",
      process.env.WEBKIT_WEBDRIVER ?? "/usr/bin/WebKitWebDriver",
    ],
    {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        SKRIUW_DB: join(workspaceDirectory, "skriuw.db"),
        SKRIUW_E2E_PICK_PATHS: fixture,
      },
    },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  return { child, readStderr: () => stderr };
}

async function createSession() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const value = await driverRequest("POST", "/session", {
        capabilities: {
          alwaysMatch: { "tauri:options": { application: binary } },
        },
      });
      return makeSession(value.sessionId);
    } catch {
      await sleep(200);
    }
  }
  throw new Error("could not create a WebDriver session against tauri-driver");
}

function assert(checks, name, pass, detail) {
  checks.push({ name, pass, detail });
  if (!pass) {
    throw new Error(`${name}: ${detail}`);
  }
}

async function runProviderImport(session) {
  await session.keys([
    { hold: KEY.control },
    { type: "k" },
    { release: KEY.control },
  ]);
  await session.waitFor(
    "return document.querySelector('[role=\"dialog\"][aria-label=\"Command palette\"]') !== null",
    "command palette",
  );
  await session.keys([{ type: "Import provider export" }]);
  await session.keys([{ type: KEY.enter }]);
  await session.waitFor(
    "return document.querySelector('dialog[open] h2')?.textContent === 'Preview import'",
    "import preview dialog",
    600,
  );
  return session.script(`
    const dialog = document.querySelector('dialog[open]');
    const counts = Object.fromEntries(
      [...dialog.querySelectorAll('.grid.grid-cols-5 > div')].map((cell) => {
        const [label, value] = [...cell.querySelectorAll('span')].map(
          (span) => span.textContent,
        );
        return [label, Number(value)];
      }),
    );
    return { counts, text: dialog.textContent };
  `);
}

async function confirmImport(session) {
  await session.script(`
    const dialog = document.querySelector('dialog[open]');
    const confirm = [...dialog.querySelectorAll('button')].find((button) =>
      button.textContent.trim().startsWith('Import '),
    );
    confirm.click();
  `);
  await session.waitFor(
    "return document.querySelector('dialog[open]')?.textContent.includes('Import complete (Notion)') === true",
    "import completion report",
    600,
  );
  const report = await session.script(
    "return document.querySelector('dialog[open]').textContent",
  );
  await session.keys([{ type: KEY.escape }]);
  await session.waitFor(
    "return document.querySelector('dialog[open]') === null",
    "report dismissal",
  );
  return report;
}

function treeState(session) {
  return session.script(`
    const rows = [...document.querySelectorAll('[role="tree"] [role="treeitem"]')];
    return { count: rows.length, titles: rows.map((row) => row.textContent.trim()) };
  `);
}

async function runScenario(session) {
  const checks = [];
  await session.waitFor(
    "return document.querySelector('[role=\"tree\"]') !== null",
    "workspace shell",
    600,
  );
  // A fresh workspace is planted with the starter preview before the first
  // render, so an empty tree here would mean seeding silently failed. Exact
  // node counts are asserted against SQLite, which does not depend on which
  // rows the sidebar has rendered yet.
  const before = await treeState(session);
  assert(
    checks,
    "starts-with-seeded-preview",
    before.count > 0 && before.titles.some((title) => title.includes("Welcome")),
    JSON.stringify(before),
  );

  const preview = await runProviderImport(session);
  assert(
    checks,
    "preview-detects-notion-with-real-zip-intake",
    preview.text.includes("Notion - detected") &&
      preview.text.includes("notion-export.zip"),
    preview.text.slice(0, 300),
  );
  assert(
    checks,
    "preview-counts-match-fixture",
    preview.counts.Notes === 6 &&
      preview.counts.Folders === 1 &&
      preview.counts.Images === 1 &&
      preview.counts.Properties === 22,
    JSON.stringify(preview.counts),
  );

  const report = await confirmImport(session);
  assert(
    checks,
    "commit-report-counts",
    report.includes("Imported 6 new notes, updated 0, skipped 0, and created 1 folder"),
    report,
  );

  const after = await treeState(session);
  assert(
    checks,
    "sidebar-shows-imported-nodes",
    after.count > before.count &&
      after.titles.some((title) => title.includes("Team wiki")) &&
      after.titles.some((title) => title.includes("Meeting Notes")),
    JSON.stringify(after),
  );

  const secondPreview = await runProviderImport(session);
  assert(
    checks,
    "reimport-skip-mode-previews-zero-notes",
    secondPreview.counts.Notes === 0,
    JSON.stringify(secondPreview.counts),
  );
  const secondReport = await confirmImport(session);
  assert(
    checks,
    "reimport-skip-mode-commits-nothing",
    secondReport.includes(
      "Imported 0 new notes, updated 0, skipped 6, and created 0 folders",
    ),
    secondReport,
  );
  const afterSecond = await treeState(session);
  assert(
    checks,
    "reimport-leaves-workspace-unchanged",
    afterSecond.count === after.count,
    JSON.stringify({ after, afterSecond }),
  );
  return { checks, tree: afterSecond };
}

async function assertCommittedDatabase(checks, workspaceDirectory) {
  const database = join(workspaceDirectory, "skriuw.db");
  const query = await run(
    "sqlite3",
    [
      database,
      "SELECT (SELECT COUNT(*) FROM workspace_nodes WHERE kind = 'note'), (SELECT COUNT(*) FROM workspace_nodes WHERE kind = 'folder'), (SELECT COUNT(*) FROM note_properties), (SELECT COUNT(*) FROM provider_import_receipts);",
    ],
    { capture: true },
  );
  const [notes, folders, properties, receipts] = query.stdout
    .trim()
    .split("|")
    .map(Number);
  // Six imported notes in one folder, on top of the five seeded preview notes
  // across their three folders.
  assert(
    checks,
    "sqlite-file-holds-seeded-preview-and-committed-import",
    notes === 11 && folders === 4 && properties > 0 && receipts === 6,
    JSON.stringify({ notes, folders, properties, receipts }),
  );
}

if (!skipBuild) {
  await run(join(app, "node_modules/.bin/tauri"), ["build", "--debug", "--no-bundle"], {
    cwd: app,
  });
}
if (!existsSync(binary)) {
  throw new Error(`debug binary missing at ${binary}; run without --skip-build`);
}

const workspaceDirectory = await mkdtemp(join(tmpdir(), "skriuw-native-e2e-"));
const driver = launchDriver(workspaceDirectory);
let session = null;
try {
  session = await createSession();
  const scenario = await runScenario(session);
  await session.close();
  session = null;
  await assertCommittedDatabase(scenario.checks, workspaceDirectory);

  const git = await run("git", ["rev-parse", "HEAD"], { capture: true });
  const result = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    revision: git.stdout.trim(),
    command: `node app/e2e/run-native.mjs${skipBuild ? " --skip-build" : ""} --output ${output}`,
    machine: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model ?? "unknown",
      logicalCpuCount: cpus().length,
      node: process.version,
    },
    scenario,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `Native import E2E passed ${scenario.checks.length} assertions\n`,
  );
  process.stdout.write(`raw native E2E evidence: ${output}\n`);
} catch (error) {
  process.stderr.write(`${driver.readStderr()}\n`);
  throw error;
} finally {
  if (session) {
    await session.close().catch(noop);
  }
  driver.child.kill("SIGTERM");
  await sleep(500);
  driver.child.kill("SIGKILL");
  await rm(workspaceDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.exit(0);
