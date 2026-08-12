import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { cpus, freemem, hostname, platform, release, tmpdir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = join(root, "app");
const fixtures = join(app, "performance/public/fixtures");
const defaultOutput = join(app, "performance/results/latest.json");
const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  root,
  outputIndex >= 0 ? (process.argv[outputIndex + 1] ?? defaultOutput) : defaultOutput,
);
const chromeBinary = process.env.CHROME_BINARY ?? "google-chrome-stable";
const baseUrl = "http://127.0.0.1:4191";
const contexts = [
  { fixture: "wide-1000", blocks: 50 },
  { fixture: "wide-5000", blocks: 500 },
  { fixture: "wide-5000", blocks: 2000 },
];

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

function run(command, arguments_, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, arguments_, {
      cwd: root,
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

function launchChrome(profileDirectory) {
  return new Promise((resolveLaunch, reject) => {
    const child = spawn(
      chromeBinary,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDirectory}`,
        "--window-size=1440,1000",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let buffered = "";
    let settled = false;
    const timeout = setTimeout(() => fail(new Error("Chrome did not expose DevTools")), 15_000);
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      reject(error);
    };
    child.stderr.on("data", (chunk) => {
      buffered += String(chunk);
      const match = buffered.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match?.[1]) {
        settled = true;
        clearTimeout(timeout);
        resolveLaunch({ child, wsUrl: match[1] });
      }
    });
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`Chrome exited early (${code})`)));
  });
}

function connectCdp(webSocketUrl) {
  return new Promise((resolveConnect, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    const listeners = [];
    let nextId = 1;
    socket.addEventListener("open", () => {
      resolveConnect({
        send(method, parameters = {}, sessionId) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params: parameters, ...(sessionId ? { sessionId } : {}) }));
          return new Promise((resolveCall, rejectCall) => pending.set(id, { resolveCall, rejectCall }));
        },
        on(method, handler) {
          listeners.push({ method, handler });
        },
        close() {
          socket.close();
        },
      });
    });
    socket.addEventListener("error", () => reject(new Error("CDP socket error")));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const call = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          call?.rejectCall(new Error(message.error.message));
        } else {
          call?.resolveCall(message.result);
        }
        return;
      }
      for (const listener of listeners) {
        if (listener.method === message.method) {
          listener.handler(message.params, message.sessionId);
        }
      }
    });
  });
}

async function evaluate(cdp, sessionId, expression, timeoutMilliseconds = 180_000) {
  const result = await Promise.race([
    cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId),
    sleep(timeoutMilliseconds).then(() => {
      throw new Error(`evaluation timed out: ${expression.slice(0, 80)}`);
    }),
  ]);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitForHarness(cdp, sessionId, pageErrors) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (pageErrors.length > 0) {
      throw new Error(`product renderer failed during startup: ${pageErrors.join("\n")}`);
    }
    if (
      await evaluate(
        cdp,
        sessionId,
        "typeof window.__SKRIUW_PRODUCT_PERFORMANCE__ !== 'undefined'",
        10_000,
      )
    ) {
      return;
    }
    await sleep(100);
  }
  throw new Error("product renderer harness did not become ready");
}

async function dispatchKey(cdp, sessionId, key, code, virtualKeyCode, text) {
  const common = {
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  };
  await cdp.send(
    "Input.dispatchKeyEvent",
    { ...common, type: "rawKeyDown" },
    sessionId,
  );
  if (text) {
    await cdp.send(
      "Input.dispatchKeyEvent",
      { ...common, type: "char", text, unmodifiedText: text },
      sessionId,
    );
  }
  await cdp.send("Input.dispatchKeyEvent", { ...common, type: "keyUp" }, sessionId);
}

function traceSummary(events, eventType) {
  const samples = events
    .filter(
      (event) =>
        event.name === "EventDispatch" &&
        event.args?.data?.type === eventType &&
        typeof event.dur === "number",
    )
    .map((event) => event.dur / 1_000);
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
  return {
    count: samples.length,
    samplesMs: samples,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted.at(-1) ?? 0,
  };
}

async function runContext(context) {
  const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-product-renderer-"));
  let chrome;
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const launched = await launchChrome(profileDirectory);
    chrome = launched.child;
    const cdp = await connectCdp(launched.wsUrl);
    const browser = await cdp.send("Browser.getVersion");
    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    cdp.on("Runtime.consoleAPICalled", (parameters, eventSession) => {
      if (eventSession === sessionId && parameters.type === "error") {
        consoleErrors.push(parameters.args.map((argument) => argument.description ?? argument.value).join(" "));
      }
    });
    cdp.on("Runtime.exceptionThrown", (parameters, eventSession) => {
      if (eventSession === sessionId) {
        pageErrors.push(parameters.exceptionDetails.exception?.description ?? parameters.exceptionDetails.text);
      }
    });
    await cdp.send("Page.navigate", {
      url: `${baseUrl}/performance/index.html?fixture=${context.fixture}&blocks=${context.blocks}`,
    }, sessionId);
    await waitForHarness(cdp, sessionId, pageErrors);
    const selection = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_PRODUCT_PERFORMANCE__.runSelection()",
    );
    const workingSet = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_PRODUCT_PERFORMANCE__.runWorkingSet()",
    );
    const traceEvents = [];
    let traceFinished = false;
    let finishTrace;
    const traceComplete = new Promise((resolveTrace) => {
      finishTrace = resolveTrace;
    });
    cdp.on("Tracing.dataCollected", (parameters) => traceEvents.push(...parameters.value));
    cdp.on("Tracing.tracingComplete", () => {
      traceFinished = true;
      finishTrace();
    });
    await cdp.send("Tracing.start", {
      traceConfig: { includedCategories: ["devtools.timeline", "input"] },
      transferMode: "ReportEvents",
    });
    const keyboardPreparation = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_PRODUCT_PERFORMANCE__.prepareKeyboard()",
    );
    for (const anchor of keyboardPreparation.anchors) {
      const expected = await evaluate(
        cdp,
        sessionId,
        `window.__SKRIUW_PRODUCT_PERFORMANCE__.positionKeyboard(${JSON.stringify(anchor)})`,
      );
      await evaluate(cdp, sessionId, "window.__SKRIUW_PRODUCT_PERFORMANCE__.alignFrame()");
      await sleep(9);
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await evaluate(
        cdp,
        sessionId,
        `window.__SKRIUW_PRODUCT_PERFORMANCE__.confirmKeyboard(${JSON.stringify(expected)})`,
      );
    }
    const keyboardSwitches = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_PRODUCT_PERFORMANCE__.finishKeyboard()",
    );
    const typingPreparation = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_PRODUCT_PERFORMANCE__.prepareTyping()",
    );
    for (let index = 0; index < typingPreparation.expected; index += 1) {
      await evaluate(cdp, sessionId, "window.__SKRIUW_PRODUCT_PERFORMANCE__.alignFrame()");
      await sleep(9);
      await dispatchKey(cdp, sessionId, "x", "KeyX", 88, "x");
      await evaluate(cdp, sessionId, "window.__SKRIUW_PRODUCT_PERFORMANCE__.confirmTyping()");
    }
    const typing = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_PRODUCT_PERFORMANCE__.finishTyping()",
    );
    const referenceSuggestions = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_PRODUCT_PERFORMANCE__.runReferenceSuggestions()",
    );
    await cdp.send("Tracing.end");
    await Promise.race([traceComplete, sleep(20_000)]);
    if (!traceFinished) {
      throw new Error("Chrome trace did not complete before timeout");
    }
    const result = await evaluate(
      cdp,
      sessionId,
      `window.__SKRIUW_PRODUCT_PERFORMANCE__.finish(${JSON.stringify(selection)}, ${JSON.stringify(workingSet)}, ${JSON.stringify(keyboardSwitches)}, ${JSON.stringify(typing)}, ${JSON.stringify(referenceSuggestions)})`,
    );
    result.correctness.push(
      {
        name: "browser-console-is-clean",
        pass: consoleErrors.length === 0,
        detail: JSON.stringify(consoleErrors),
      },
      {
        name: "browser-page-errors-are-empty",
        pass: pageErrors.length === 0,
        detail: JSON.stringify(pageErrors),
      },
    );
    const failed = result.correctness.filter((check) => !check.pass);
    if (failed.length > 0) {
      throw new Error(`correctness failures: ${JSON.stringify(failed)}`);
    }
    const trace = {
      keyboard: traceSummary(traceEvents, "keydown"),
      input: traceSummary(traceEvents, "input"),
    };
    if (trace.keyboard.count < 130) {
      throw new Error(`trace captured ${trace.keyboard.count} keydowns, expected at least 130`);
    }
    await evaluate(cdp, sessionId, "window.__SKRIUW_PRODUCT_PERFORMANCE__.destroy()");
    cdp.close();
    return {
      ...result,
      trace,
      browser: browser.product,
      consoleErrors,
      pageErrors,
    };
  } finally {
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise((resolveExit) => chrome.once("exit", resolveExit));
      chrome.kill("SIGKILL");
      await exited;
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await rm(profileDirectory, { recursive: true, force: true });
        break;
      } catch (error) {
        if (error?.code !== "ENOTEMPTY" || attempt === 19) {
          throw error;
        }
        await sleep(100);
      }
    }
  }
}

function budgetStatus(record) {
  const below = (summary, p95, maximum) => summary.p95Ms < p95 && summary.maxMs < maximum;
  return {
    cachedEditorSwap: below(record.selection.summary.editorInstallation, 8, 16.67),
    boundedEditorWorkingSet:
      record.workingSet.maximumObservedSize <= record.workingSet.configuredLimit &&
      record.workingSet.finalObservedSize <= record.workingSet.configuredLimit &&
      record.workingSet.evictions > 0 &&
      record.workingSet.coldRevisitWasEvicted === true &&
      record.workingSet.bridgeCalls.length === 0,
    coldEditorRevisit:
      record.workingSet.coldRevisitWasEvicted === true &&
      record.workingSet.coldRevisitDispatchMs < 8,
    selectionDispatch: record.selection.summary.dispatch.p95Ms < 8,
    keystrokeToPaint: below(record.typing.summary.nextPaint, 8, 16.67),
    hundredSwitchesDroppedNoFrames: record.keyboardSwitches.droppedFrames === 0,
    referenceSuggestions:
      record.referenceSuggestions.p95Ms < 8 &&
      record.referenceSuggestions.maxMs < 16.67 &&
      record.referenceSuggestions.bridgeCalls.length === 0,
  };
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
await run("pnpm", ["--dir", app, "exec", "tsc", "--noEmit", "-p", "performance/tsconfig.json"]);
await run("pnpm", [
  "--dir",
  app,
  "exec",
  "vite",
  "build",
  "--config",
  "performance/vite.config.ts",
  "--mode",
  "production",
]);
const preview = spawn(
  join(app, "node_modules/.bin/vite"),
  ["preview", "--config", join(app, "performance/vite.config.ts")],
  { cwd: root, stdio: "ignore", env: process.env },
);
try {
  await waitForServer();
  const records = [];
  for (const context of contexts) {
    const record = await runContext(context);
    record.budgets = budgetStatus(record);
    records.push(record);
    const swap = record.selection.summary.editorInstallation;
    process.stdout.write(
      `${context.fixture}/${context.blocks}: swap P95=${swap.p95Ms.toFixed(2)} ms max=${swap.maxMs.toFixed(2)} ms, dropped=${record.keyboardSwitches.droppedFrames}\n`,
    );
  }
  const git = await run("git", ["rev-parse", "HEAD"], { capture: true });
  const cpu = cpus()[0];
  const result = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    revision: git.stdout.trim(),
    command: `node app/performance/run.mjs --output ${output}`,
    machine: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      cpu: cpu?.model ?? "unknown",
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtStart: freemem(),
      node: process.version,
      chromeBinary,
    },
    records,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`raw product renderer samples: ${output}\n`);
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
process.exit(0);
