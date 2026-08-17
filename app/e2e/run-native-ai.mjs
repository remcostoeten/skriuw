import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { cpus, hostname, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = join(root, "app");
const binary = join(app, "src-tauri/target/debug/skriuw-app");
const driverBaseUrl = "http://127.0.0.1:4444";
const skipBuild = process.argv.includes("--skip-build");
const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  root,
  outputIndex >= 0
    ? (process.argv[outputIndex + 1] ?? "app/e2e/results/native-ai-latest.json")
    : "app/e2e/results/native-ai-latest.json",
);
// A pull has to stream real bytes for the progress rail to mean anything, so
// the scenario uses the smallest model Ollama publishes and deletes it again.
const PULL_MODEL = "all-minilm";
const KEY = { control: "", enter: "", escape: "" };
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
  // The webview swaps frames while the shell boots, so an evaluation can fail
  // with "no such frame" before the app is ready. That is a not-yet, not a
  // failure, and only a genuine timeout should end the run.
  async function waitFor(expression, description, attempts = 200) {
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        if (await script(expression)) {
          return;
        }
      } catch (error) {
        lastError = error;
      }
      await sleep(100);
    }
    throw new Error(
      `timed out waiting for ${description}${lastError ? `; last error: ${lastError.message}` : ""}`,
    );
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
    ["--native-driver", process.env.WEBKIT_WEBDRIVER ?? "/usr/bin/WebKitWebDriver"],
    {
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, SKRIUW_DB: join(workspaceDirectory, "skriuw.db") },
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
        capabilities: { alwaysMatch: { "tauri:options": { application: binary } } },
      });
      return makeSession(value.sessionId);
    } catch {
      await sleep(200);
    }
  }
  throw new Error("could not create a WebDriver session against tauri-driver");
}

// Set when the scenario starts the runtime itself. An Ollama the host was
// already running is external and must be left alone.
let scenarioStartedRuntime = false;

function assert(checks, name, pass, detail) {
  checks.push({ name, pass, detail });
  if (!pass) {
    throw new Error(`${name}: ${detail}`);
  }
}

function sectionTabs(session) {
  return session.script(`
    return [...document.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent.trim());
  `);
}

function runtimeCard(session) {
  return session.script(`
    const section = document.querySelector('section[aria-label="AI settings"]');
    if (!section) return null;
    const bar = section.querySelector('[role="progressbar"]');
    return {
      text: section.textContent,
      progress: bar
        ? { label: bar.getAttribute('aria-label'), now: Number(bar.getAttribute('aria-valuenow')) }
        : null,
      live: [...section.querySelectorAll('[aria-live="polite"]')].map((node) =>
        node.textContent.trim(),
      ),
      models: [...section.querySelectorAll('[role="radio"]')].map((radio) => ({
        text: radio.textContent.trim(),
        checked: radio.getAttribute('aria-checked') === 'true',
      })),
    };
  `);
}

async function openSettings(session) {
  await session.keys([{ hold: KEY.control }, { type: "," }, { release: KEY.control }]);
  await session.waitFor(
    `return document.querySelector('[role="tablist"][aria-label="Settings sections"]') !== null`,
    "settings dialog",
  );
}

async function runScenario(session) {
  const checks = [];
  await session.waitFor(
    `return document.querySelector('[role="tree"]') !== null`,
    "workspace shell",
    600,
  );
  await session.waitFor(
    `return document.querySelector('.onboarding-root [id="onboarding-title"]') !== null`,
    "onboarding modal",
  );
  await session.script(`
    [...document.querySelectorAll('.onboarding-root button')]
      .find((button) => button.textContent.trim() === 'Start writing')
      .click();
  `);
  await session.waitFor(
    `return document.querySelector('.onboarding-root') === null`,
    "onboarding dismissal",
  );

  // The opt-in gate is structural: with AI off, the section must not exist at
  // all, and no Ollama work may have run just because settings opened.
  await openSettings(session);
  const gatedTabs = await sectionTabs(session);
  assert(
    checks,
    "ai-section-absent-until-opt-in",
    gatedTabs.length > 0 && !gatedTabs.includes("AI"),
    JSON.stringify(gatedTabs),
  );

  const toggled = await session.script(`
    const label = [...document.querySelectorAll('label')].find((node) =>
      node.textContent.trim().startsWith('AI features'),
    );
    if (!label) {
      return {
        found: false,
        labels: [...document.querySelectorAll('label')].map((node) =>
          node.textContent.trim().slice(0, 40),
        ),
      };
    }
    const input = label.querySelector('input[type="checkbox"]');
    input.click();
    return { found: true, checked: input.checked };
  `);
  assert(
    checks,
    "ai-features-toggle-is-reachable",
    toggled.found && toggled.checked,
    JSON.stringify(toggled),
  );
  await session.waitFor(
    `return [...document.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent.trim() === 'AI')`,
    "AI tab after opt-in",
  );
  const enabledTabs = await sectionTabs(session);
  assert(checks, "opt-in-reveals-ai-section", enabledTabs.includes("AI"), JSON.stringify(enabledTabs));

  await session.script(`
    [...document.querySelectorAll('[role="tab"]')]
      .find((tab) => tab.textContent.trim() === 'AI')
      .click();
  `);
  await session.waitFor(
    `return document.querySelector('section[aria-label="AI settings"]') !== null`,
    "AI settings section",
  );
  await session.waitFor(
    `return document.querySelector('section[aria-label="AI settings"]')?.textContent.includes('Checking Ollama') === false`,
    "runtime detection to settle",
    300,
  );

  const detected = await runtimeCard(session);
  assert(
    checks,
    "runtime-card-reports-a-real-state",
    /Ready to start|Running · v|Not installed|Installer required/.test(detected.text),
    detected.text.slice(0, 200),
  );

  // A host without Ollama can still prove the whole remote-provider surface.
  // The runtime phase is skipped rather than failed, and the skip is recorded
  // so a green run never reads as broader coverage than it had.
  const runnable =
    detected.text.includes("Ready to start") || detected.text.includes("Running · v");
  if (!runnable) {
    assert(
      checks,
      "local-runtime-phase-skipped-no-ollama-on-host",
      true,
      detected.text.slice(0, 160),
    );
    await runProviderScenario(session, checks);
    return { checks, finalCard: detected.text.slice(0, 400), localRuntimeVerified: false };
  }

  const startable = detected.text.includes("Ready to start");
  scenarioStartedRuntime = startable;
  if (startable) {
    await session.script(`
      const section = document.querySelector('section[aria-label="AI settings"]');
      [...section.querySelectorAll('button')]
        .find((button) => button.textContent.trim() === 'Start')
        .click();
    `);
  }
  await session.waitFor(
    `return document.querySelector('section[aria-label="AI settings"]')?.textContent.includes('Running · v') === true`,
    "runtime to report running",
    900,
  );
  const running = await runtimeCard(session);
  assert(
    checks,
    "start-action-brings-the-runtime-up",
    /Running · v\d/.test(running.text),
    running.text.slice(0, 200),
  );
  assert(
    checks,
    "ownership-is-reported-honestly",
    startable
      ? running.text.includes("Started by Skriuw")
      : running.text.includes("managed outside Skriuw"),
    running.text.slice(0, 300),
  );
  assert(
    checks,
    "model-panel-appears-once-running",
    running.text.includes("Pull model"),
    running.text.slice(0, 300),
  );

  await session.script(
    `
    const input = document.querySelector('input[aria-label="Model name"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, arguments[0]);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  `,
    [PULL_MODEL],
  );
  await session.script(`
    const section = document.querySelector('section[aria-label="AI settings"]');
    [...section.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Pull model')
      .click();
  `);
  await session.waitFor(
    `return document.querySelector('section[aria-label="AI settings"] [aria-live="polite"]')?.textContent.trim().length > 0`,
    "pull progress to be announced",
    600,
  );
  const pulling = await runtimeCard(session);
  assert(
    checks,
    "pull-progress-is-announced-politely",
    pulling.live.some((text) => text.length > 0),
    JSON.stringify(pulling.live),
  );

  await session.waitFor(
    `return [...document.querySelectorAll('section[aria-label="AI settings"] [role="radio"]')]
       .some((radio) => radio.textContent.includes(${JSON.stringify(PULL_MODEL)})) === true`,
    "pulled model to appear",
    3000,
  );
  const pulled = await runtimeCard(session);
  const pulledRow = pulled.models.find((model) => model.text.includes(PULL_MODEL));
  assert(
    checks,
    "pulled-model-is-listed-with-its-disk-use",
    pulledRow !== undefined && /\d+(\.\d+)?\s?(Bytes|KB|MB|GB)/.test(pulledRow.text),
    JSON.stringify(pulled.models),
  );
  assert(
    checks,
    "pulled-model-becomes-the-selection",
    pulledRow?.checked === true,
    JSON.stringify(pulled.models),
  );

  // Deletion is armed inline before the destructive request is ever sent.
  const armed = await session.script(`
    const section = document.querySelector('section[aria-label="AI settings"]');
    const row = [...section.querySelectorAll('[role="radio"]')]
      .find((radio) => radio.textContent.includes(arguments[0]))
      .closest('div');
    const remove = [...row.querySelectorAll('button')].find((button) =>
      button.textContent.trim() === 'Delete',
    );
    remove.click();
    return [...row.querySelectorAll('button')].map((button) => button.textContent.trim());
  `, [PULL_MODEL]);
  assert(
    checks,
    "delete-arms-before-it-destroys",
    armed.includes("Confirm delete"),
    JSON.stringify(armed),
  );
  await session.script(`
    const section = document.querySelector('section[aria-label="AI settings"]');
    const row = [...section.querySelectorAll('[role="radio"]')]
      .find((radio) => radio.textContent.includes(arguments[0]))
      .closest('div');
    [...row.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Confirm delete')
      .click();
  `, [PULL_MODEL]);
  await session.waitFor(
    `return [...document.querySelectorAll('section[aria-label="AI settings"] [role="radio"]')]
       .some((radio) => radio.textContent.includes(${JSON.stringify(PULL_MODEL)})) === false`,
    "model removal",
    600,
  );
  const removed = await runtimeCard(session);
  assert(
    checks,
    "confirmed-delete-removes-the-model",
    removed.models.every((model) => !model.text.includes(PULL_MODEL)),
    JSON.stringify(removed.models),
  );

  await runProviderScenario(session, checks);
  return { checks, finalCard: removed.text.slice(0, 400), localRuntimeVerified: true };
}

function providerCards(session) {
  return session.script(`
    const root = document.querySelector('section[aria-label="AI settings"]');
    return [...root.querySelectorAll('section[aria-label]')].map((card) => ({
      label: card.getAttribute('aria-label'),
      text: card.textContent,
      hasKeyInput: card.querySelector('input[type="password"]') !== null,
      keyValue: card.querySelector('input[type="password"]')?.value ?? null,
      buttons: [...card.querySelectorAll('button')].map((button) => button.textContent.trim()),
    }));
  `);
}

function clickInCard(session, label, text) {
  return session.script(
    `
    const root = document.querySelector('section[aria-label="AI settings"]');
    const card = [...root.querySelectorAll('section[aria-label]')]
      .find((node) => node.getAttribute('aria-label') === arguments[0]);
    [...card.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === arguments[1])
      .click();
  `,
    [label, text],
  );
}

/**
 * Remote providers are verified without spending a key and without writing to
 * the OS keyring: the scenario stores a sentinel under the session-only tier
 * and never touches "Test key", which bills the user's account.
 */
async function runProviderScenario(session, checks) {
  const SENTINEL = "not-a-real-key-0000000000";
  const gated = await providerCards(session);
  assert(
    checks,
    "remote-providers-are-listed",
    gated.length >= 2,
    JSON.stringify(gated.map((card) => card.label)),
  );
  assert(
    checks,
    "key-entry-is-gated-behind-consent",
    gated.every((card) => !card.hasKeyInput),
    JSON.stringify(gated.map((card) => ({ label: card.label, hasKeyInput: card.hasKeyInput }))),
  );

  const target = gated[0].label;
  await clickInCard(session, target, "Accept and continue");
  await session.waitFor(
    `return document.querySelector('section[aria-label=${JSON.stringify(target)}] input[type="password"]') !== null`,
    "key entry after consent",
  );
  const consented = (await providerCards(session)).find((card) => card.label === target);
  assert(
    checks,
    "consent-reveals-key-entry-and-revoke",
    consented.hasKeyInput && consented.buttons.includes("Revoke"),
    JSON.stringify(consented.buttons),
  );

  await session.script(
    `
    const card = document.querySelector('section[aria-label=' + JSON.stringify(arguments[0]) + ']');
    const tier = [...card.querySelectorAll('label')]
      .find((node) => node.textContent.includes('This session only'));
    tier.querySelector('input[type="radio"]').click();
    const input = card.querySelector('input[type="password"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, arguments[1]);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  `,
    [target, SENTINEL],
  );
  await clickInCard(session, target, "Save key");
  await session.waitFor(
    `return [...document.querySelector('section[aria-label=${JSON.stringify(target)}]').querySelectorAll('button')]
       .some((button) => button.textContent.trim() === 'Remove key')`,
    "stored session key",
    600,
  );
  const stored = (await providerCards(session)).find((card) => card.label === target);
  assert(
    checks,
    "session-only-key-is-accepted-without-the-keyring",
    stored.buttons.includes("Remove key") && /session/i.test(stored.text),
    stored.text.slice(0, 200),
  );
  assert(
    checks,
    "stored-key-is-never-rendered-back",
    !stored.text.includes(SENTINEL) && stored.keyValue !== SENTINEL,
    JSON.stringify({ echoedInText: stored.text.includes(SENTINEL), inputValue: stored.keyValue }),
  );

  await clickInCard(session, target, "Remove key");
  const armed = (await providerCards(session)).find((card) => card.label === target);
  assert(
    checks,
    "remove-key-arms-before-it-destroys",
    armed.buttons.includes("Confirm remove"),
    JSON.stringify(armed.buttons),
  );
  await clickInCard(session, target, "Confirm remove");
  await session.waitFor(
    `return [...document.querySelector('section[aria-label=${JSON.stringify(target)}]').querySelectorAll('button')]
       .some((button) => button.textContent.trim() === 'Remove key') === false`,
    "key removal",
    600,
  );

  await clickInCard(session, target, "Revoke");
  await session.waitFor(
    `return document.querySelector('section[aria-label=${JSON.stringify(target)}] input[type="password"]') === null`,
    "consent revocation",
    600,
  );
  const revoked = (await providerCards(session)).find((card) => card.label === target);
  assert(
    checks,
    "revoke-returns-the-provider-to-consent-required",
    !revoked.hasKeyInput && !revoked.buttons.includes("Revoke"),
    JSON.stringify(revoked.buttons),
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

const workspaceDirectory = await mkdtemp(join(tmpdir(), "skriuw-native-ai-e2e-"));
const driver = launchDriver(workspaceDirectory);
let session = null;
try {
  session = await createSession();
  const scenario = await runScenario(session);
  await session.close();
  session = null;

  const git = await run("git", ["rev-parse", "HEAD"], { capture: true });
  const result = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    revision: git.stdout.trim(),
    command: `node app/e2e/run-native-ai.mjs${skipBuild ? " --skip-build" : ""} --output ${output}`,
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
  process.stdout.write(`Native AI E2E passed ${scenario.checks.length} assertions\n`);
  process.stdout.write(`raw native E2E evidence: ${output}\n`);
} catch (error) {
  process.stderr.write(`${driver.readStderr()}\n`);
  throw error;
} finally {
  // The driver kills the app outright, so Tauri's exit handler never runs and
  // a runtime this scenario started stays up. Stop it here instead of leaving
  // the host with an Ollama it did not ask for.
  if (session) {
    await session.close().catch(noop);
  }
  if (scenarioStartedRuntime) {
    await run("pkill", ["-x", "ollama"], { capture: true }).catch(noop);
  }
  driver.child.kill("SIGTERM");
  await sleep(500);
  driver.child.kill("SIGKILL");
  await rm(workspaceDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
process.exit(0);
