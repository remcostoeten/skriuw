import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, freemem, hostname, platform, release, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { budgetStatus, failedBudgets } from "./budgets.ts";
import { launchChromeDriver, launchWebKitDriver, sleep } from "./browser-drivers.mjs";
import { scenarioTrace, summarizeTraceEvents, traceSummary } from "./trace.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const app = join(root, "apps/workspace");
const fixtures = join(app, "performance/public/fixtures");
const defaultOutput = join(app, "performance/results/latest.json");
const defaultContexts = ["wide-1000/50", "wide-1000/150", "wide-5000/500", "wide-5000/2000"];
const { values: options } = parseArgs({
  options: {
    output: { type: "string", default: defaultOutput },
    headed: { type: "boolean", default: false },
    browser: { type: "string", default: "chrome" },
    content: { type: "string", default: "varied" },
    context: { type: "string", multiple: true },
  },
});
const output = resolve(root, options.output);
const headed = options.headed;
if (!["chrome", "webkit"].includes(options.browser)) {
  throw new Error(`--browser must be chrome or webkit, got ${options.browser}`);
}
if (!["varied", "plain"].includes(options.content)) {
  throw new Error(`--content must be varied or plain, got ${options.content}`);
}
const contexts = (options.context ?? defaultContexts)
  .flatMap((value) => value.split(","))
  .map((value) => {
    const match = /^([a-z]+-\d+)\/(\d+)$/.exec(value.trim());
    if (!match) {
      throw new Error(`--context must look like wide-1000/50, got ${value}`);
    }
    return { fixture: match[1], blocks: Number(match[2]) };
  });
const baseUrl = "http://127.0.0.1:4191";
const harness = "window.__SKRIUW_PRODUCT_PERFORMANCE__";
const keys = {
  enter: { key: "Enter", code: "Enter", keyCode: 13 },
  x: { key: "x", code: "KeyX", keyCode: 88, text: "x" },
  arrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
};
const PENDING_SWITCH_PAUSE_MS = 150;
const SCENARIO_TRACE_CATEGORIES = ["devtools.timeline", "toplevel", "blink.user_timing"];

function run(command, arguments_, runOptions = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, arguments_, {
      cwd: runOptions.cwd ?? root,
      stdio: runOptions.capture ? ["ignore", "pipe", "pipe"] : "inherit",
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

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/performance/index.html`);
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(100);
    }
  }
  throw new Error("product renderer preview did not become ready");
}

async function waitForHarness(driver) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (driver.pageErrors.length > 0) {
      throw new Error(`product renderer failed during startup: ${driver.pageErrors.join("\n")}`);
    }
    if (await driver.evaluate(`typeof ${harness} !== 'undefined'`, 10_000)) {
      return;
    }
    const failure = await driver.evaluate(
      "document.getElementById('root')?.textContent?.startsWith('Performance fixture failed') ? document.getElementById('root').textContent : null",
      10_000,
    );
    if (failure) {
      throw new Error(failure);
    }
    await sleep(100);
  }
  throw new Error("product renderer harness did not become ready");
}

async function pressAligned(driver, key) {
  await driver.evaluate(`${harness}.alignFrame()`);
  await sleep(9);
  await driver.key(key);
}

async function runExistingPhases(driver) {
  const selection = await driver.evaluate(`${harness}.runSelection()`);
  const workingSet = await driver.evaluate(`${harness}.runWorkingSet()`);
  if (driver.supportsTrace) {
    await driver.startTrace(["devtools.timeline", "input"]);
  }
  const keyboardPreparation = await driver.evaluate(`${harness}.prepareKeyboard()`);
  for (const anchor of keyboardPreparation.anchors) {
    const expected = await driver.evaluate(
      `${harness}.positionKeyboard(${JSON.stringify(anchor)})`,
    );
    await pressAligned(driver, keys.enter);
    await driver.evaluate(`${harness}.confirmKeyboard(${JSON.stringify(expected)})`);
  }
  const keyboardSwitches = await driver.evaluate(`${harness}.finishKeyboard()`);
  const navigationTail = await driver.evaluate(`${harness}.settleNavigation()`);
  const typingPreparation = await driver.evaluate(`${harness}.prepareTyping()`);
  for (let index = 0; index < typingPreparation.expected; index += 1) {
    await pressAligned(driver, keys.x);
    await driver.evaluate(`${harness}.confirmTyping()`);
  }
  const typing = await driver.evaluate(`${harness}.finishTyping()`);
  const linkCaretPreparation = await driver.evaluate(`${harness}.prepareLinkCaret()`);
  for (let index = 0; index < linkCaretPreparation.expected; index += 1) {
    await pressAligned(driver, keys.arrowRight);
    await driver.evaluate(`${harness}.alignFrame()`);
  }
  const linkCaret = await driver.evaluate(`${harness}.finishLinkCaret()`);
  const referenceSuggestions = await driver.evaluate(`${harness}.runReferenceSuggestions()`);
  const traceEvents = driver.supportsTrace ? await driver.stopTrace() : null;
  const result = await driver.evaluate(
    `${harness}.finish(${JSON.stringify(selection)}, ${JSON.stringify(workingSet)}, ${JSON.stringify(keyboardSwitches)}, ${JSON.stringify(typing)}, ${JSON.stringify(linkCaret)}, ${JSON.stringify(referenceSuggestions)})`,
  );
  const trace =
    traceEvents === null
      ? null
      : {
          keyboard: traceSummary(traceEvents, "keydown"),
          idleCallbacks: summarizeTraceEvents(
            traceEvents.filter((event) => event.name === "FireIdleCallback"),
          ),
          input: traceSummary(traceEvents, "input"),
        };
  if (trace !== null) {
    result.correctness.push({
      name: "trace-captured-keydowns",
      pass: trace.keyboard.count >= 130,
      detail: `${trace.keyboard.count} keydowns, expected at least 130`,
    });
  }
  return { ...result, navigationTail, trace };
}

async function runScenarios(driver) {
  if (driver.supportsTrace) {
    await driver.startTrace(SCENARIO_TRACE_CATEGORIES);
  }
  const save = await driver.evaluate(`${harness}.prepareSavePause()`);
  for (let iteration = 0; iteration < save.iterations; iteration += 1) {
    for (let index = 0; index < save.keystrokes; index += 1) {
      await pressAligned(driver, keys.x);
    }
    await driver.evaluate(`${harness}.awaitSave()`);
  }
  const savePause = await driver.evaluate(`${harness}.finishSavePause()`);

  let pendingIterations = 1;
  for (let iteration = 0; iteration < pendingIterations; iteration += 1) {
    const target = await driver.evaluate(`${harness}.preparePendingSwitch(${iteration})`);
    pendingIterations = target.iterations;
    for (let index = 0; index < target.keystrokes; index += 1) {
      await pressAligned(driver, keys.x);
    }
    await sleep(PENDING_SWITCH_PAUSE_MS);
    await driver.click(target);
    await driver.evaluate(`${harness}.confirmPendingSwitch(${JSON.stringify(target.expectedId)})`);
  }
  const pendingSaveSwitch = await driver.evaluate(`${harness}.finishPendingSwitch()`);

  const bubble = await driver.evaluate(`${harness}.prepareBubble()`);
  for (let index = 0; index < bubble.expected; index += 1) {
    await pressAligned(driver, { ...keys.arrowRight, shift: true });
  }
  const bubbleHold = await driver.evaluate(`${harness}.holdBubble()`);

  const collapsePoint = await driver.evaluate(
    `${harness}.prepareSidebarToggle('sidebar-collapse')`,
  );
  await driver.click(collapsePoint);
  const sidebarCollapse = await driver.evaluate(`${harness}.settleSidebarToggle()`);
  const expandPoint = await driver.evaluate(`${harness}.prepareSidebarToggle('sidebar-expand')`);
  await driver.click(expandPoint);
  const sidebarExpand = await driver.evaluate(`${harness}.settleSidebarToggle()`);

  const scroll = await driver.evaluate(
    `${harness}.prepareScroll(${JSON.stringify(driver.wheelScrolls ? "wheel" : "scrollBy")})`,
  );
  for (let tick = 0; tick < scroll.ticks; tick += 1) {
    await driver.evaluate(`${harness}.alignFrame()`);
    if (driver.wheelScrolls) {
      await driver.wheel(scroll, scroll.deltaY);
    } else {
      await driver.evaluate(`${harness}.scrollStep()`);
    }
  }
  const scrolled = await driver.evaluate(`${harness}.finishScroll()`);

  const traceEvents = driver.supportsTrace ? await driver.stopTrace() : null;
  const scenarios = await driver.evaluate(
    `${harness}.finishScenarios(${JSON.stringify({ savePause, pendingSaveSwitch, bubbleHold, sidebarCollapse, sidebarExpand, scroll: scrolled })})`,
  );
  return { ...scenarios, trace: traceEvents === null ? null : scenarioTrace(traceEvents) };
}

async function runContext(context) {
  const driver =
    options.browser === "webkit"
      ? await launchWebKitDriver({ headed })
      : await launchChromeDriver({ headed });
  try {
    const captureErrors = driver.name === "webkit" ? "&capture-errors=1" : "";
    await driver.open(
      `${baseUrl}/performance/index.html?fixture=${context.fixture}&blocks=${context.blocks}&content=${options.content}${captureErrors}`,
    );
    await waitForHarness(driver);
    const result = await runExistingPhases(driver);
    const scenarios = await runScenarios(driver);
    if (driver.name === "webkit") {
      driver.consoleErrors.push(...(await driver.evaluate(`${harness}.readPageErrors()`)));
    }
    await driver.evaluate(`${harness}.destroy()`);
    const correctness = [
      ...result.correctness,
      ...scenarios.correctness,
      {
        name: "browser-console-is-clean",
        pass: driver.consoleErrors.length === 0,
        detail: JSON.stringify(driver.consoleErrors),
      },
      {
        name: "browser-page-errors-are-empty",
        pass: driver.pageErrors.length === 0,
        detail: JSON.stringify(driver.pageErrors),
      },
    ];
    return {
      ...result,
      correctness,
      scenarios,
      browser: driver.version,
      browserName: driver.name,
      browserBinary: driver.binary,
      consoleErrors: driver.consoleErrors,
      pageErrors: driver.pageErrors,
    };
  } finally {
    await driver.close();
  }
}

function formatMs(value) {
  return value === null || value === undefined ? "N/A" : `${value.toFixed(2)} ms`;
}

function maxOf(values) {
  return values.length === 0 ? null : Math.max(...values);
}

function reportScenarios(record) {
  const { scenarios } = record;
  const trace = scenarios.trace;
  function traceLine(name) {
    const window = trace?.windows[name];
    return window
      ? `, longest task ${formatMs(window.longestTaskMs)}, ${window.tasksOver8Ms} tasks over 8 ms`
      : "";
  }
  function frames(phase) {
    return `frame gap max ${formatMs(phase.summary.frameGaps.maxMs)}, misses 60/120 Hz ${phase.frameMisses.at60Hz}/${phase.frameMisses.at120Hz}, LoAF ${record.capabilities.longAnimationFrames ? phase.longAnimationFrames.length : "N/A"}, React commits ${phase.reactCommits}`;
  }
  const save = scenarios.savePause;
  process.stdout.write(
    `  INFO save pause: ${save.savesObserved}/${save.iterations} saves, delay max ${formatMs(maxOf(save.saveDelayMs))}, save frame gap max ${formatMs(maxOf(save.saveFrameGapMs))}, save task max ${trace ? formatMs(maxOf(trace.saveTasksMs["save-pause"])) : "N/A"}; ${frames(save)}${traceLine("save-pause")}\n`,
  );
  const pending = scenarios.pendingSaveSwitch;
  process.stdout.write(
    `  INFO pending-save switch: ${pending.landed}/${pending.iterations} landed, click to paint P95 ${formatMs(pending.summary.nextPaint.p95Ms)} max ${formatMs(pending.summary.nextPaint.maxMs)}, press to paint max ${formatMs(maxOf(pending.pressToSwitchPaintMs))}, saves per switch ${pending.savesDuringSwitch.join("/")}, click dispatch max ${trace ? formatMs(trace.windows["pending-save-switch"]?.click.maxMs ?? null) : "N/A"}; ${frames(pending)}${traceLine("pending-save-switch")}\n`,
  );
  const bubble = scenarios.bubbleHold;
  process.stdout.write(
    `  INFO bubble menu: opened ${bubble.opened} in ${formatMs(bubble.openMs)}, held ${bubble.holdMs.toFixed(0)} ms; ${frames(bubble)}${traceLine("bubble-hold")}\n`,
  );
  for (const [label, phase] of [
    ["sidebar collapse", scenarios.sidebarCollapse],
    ["sidebar expand", scenarios.sidebarExpand],
  ]) {
    const name = label === "sidebar collapse" ? "sidebar-collapse" : "sidebar-expand";
    process.stdout.write(
      `  INFO ${label}: toggled ${phase.toggled}; ${frames(phase)}${traceLine(name)}\n`,
    );
  }
  const scroll = scenarios.scroll;
  process.stdout.write(
    `  INFO scroll (${scroll.input}): ${scroll.ticks} ticks, ${scroll.scrolledPx.toFixed(0)} px, ${scroll.renderedBlocksAtEnd} blocks rendered, window updateState P95 ${formatMs(scroll.summary.editorInstallation.p95Ms)}; ${frames(scroll)}${traceLine("scroll")}\n`,
  );
}

function reportRecord(context, record) {
  const swap = record.selection.summary.editorInstallation;
  process.stdout.write(
    `${context.fixture}/${context.blocks} (${record.browserName}, ${record.fixture.content} content v${record.fixture.contentVersion}): swap P95=${swap.p95Ms.toFixed(2)} ms max=${swap.maxMs.toFixed(2)} ms, dropped=${record.keyboardSwitches.droppedFrames}\n`,
  );
  for (const [name, passed] of Object.entries(record.budgets)) {
    const verdict = passed === null ? "N/A" : passed ? "PASS" : "FAIL";
    process.stdout.write(`  ${verdict} ${name}\n`);
  }
  for (const check of record.correctness.filter((entry) => !entry.pass)) {
    process.stdout.write(`  FAIL correctness ${check.name}: ${check.detail.slice(0, 400)}\n`);
  }
  const growth = record.selection.summary.windowGrowth;
  const idle = record.trace?.idleCallbacks;
  process.stdout.write(
    `  INFO idle callbacks: ${idle ? `${idle.count}, max ${idle.maxMs.toFixed(2)} ms` : "N/A"}; window growth updateState P95 ${growth.p95Ms.toFixed(2)} ms, max ${growth.maxMs.toFixed(2)} ms\n`,
  );
  const tail = record.navigationTail;
  process.stdout.write(
    `  INFO navigationTail: ${tail.reactCommits} React commits, ${tail.bridgeCalls.length} bridge calls (${[...new Set(tail.bridgeCalls)].join(", ") || "none"}), ${tail.unlinkedMentionRows} unlinked mention rows, frame gap max ${tail.frameGapMaxMs.toFixed(2)} ms in ${tail.windowMs.toFixed(0)} ms\n`,
  );
  reportScenarios(record);
}

await mkdir(fixtures, { recursive: true });
await run("cargo", [
  "run",
  "--release",
  "--locked",
  "-p",
  "skriuw-fixtures",
  "--example",
  "export_tree_projection",
  "--",
  fixtures,
]);
await run("bun", ["x", "tsc", "--noEmit", "-p", "performance/tsconfig.json"], { cwd: app });
await run(
  "bun",
  ["x", "vite", "build", "--config", "performance/vite.config.ts", "--mode", "production"],
  { cwd: app },
);
const preview = spawn(
  join(app, "node_modules/.bin/vite"),
  ["preview", "--config", join(app, "performance/vite.config.ts")],
  { cwd: root, stdio: "ignore", env: process.env },
);
let failures = [];
try {
  await waitForServer();
  const records = [];
  for (const context of contexts) {
    const record = await runContext(context);
    record.budgets = budgetStatus(record);
    records.push(record);
    reportRecord(context, record);
  }
  const git = await run("git", ["rev-parse", "HEAD"], { capture: true });
  const cpu = cpus()[0];
  const result = {
    schemaVersion: 2,
    measuredAt: new Date().toISOString(),
    revision: git.stdout.trim(),
    command: `node apps/workspace/performance/run.mjs --browser ${options.browser} --content ${options.content}${headed ? " --headed" : ""} --context ${contexts.map((context) => `${context.fixture}/${context.blocks}`).join(",")} --output ${output}`,
    machine: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      cpu: cpu?.model ?? "unknown",
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtStart: freemem(),
      node: process.version,
      browser: options.browser,
      browserBinary: records[0]?.browserBinary ?? null,
    },
    records,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`raw product renderer samples: ${output}\n`);
  failures = records.flatMap((record, index) => {
    const label = `${contexts[index].fixture}/${contexts[index].blocks}`;
    return [
      ...failedBudgets(record.budgets).map((name) => `${label}: ${name}`),
      ...record.correctness
        .filter((check) => !check.pass)
        .map((check) => `${label}: correctness ${check.name}`),
    ];
  });
} finally {
  if (preview.exitCode === null && preview.signalCode === null) {
    const exited = new Promise((resolveExit) => preview.once("exit", resolveExit));
    preview.kill("SIGTERM");
    await Promise.race([exited, sleep(5_000)]);
    if (preview.exitCode === null && preview.signalCode === null) {
      preview.kill("SIGKILL");
    }
  }
}
if (failures.length > 0) {
  process.stdout.write(`budget and correctness failures:\n${failures.join("\n")}\n`);
  process.exit(1);
}
process.exit(0);
