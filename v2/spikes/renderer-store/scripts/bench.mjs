import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME_BINARY = process.env.CHROME_BINARY ?? "google-chrome-stable";
const KEY_COUNT = 100;
const KEY_INTERVAL_MS = 24;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function launchChrome(profileDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      CHROME_BINARY,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDir}`,
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
    const onData = (chunk) => {
      buffered += String(chunk);
      const match = buffered.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        settled = true;
        clearTimeout(timeout);
        child.stderr.off("data", onData);
        resolve({ child, wsUrl: match[1] });
      }
    };
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.stderr.off("data", onData);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      reject(error);
    };
    const timeout = setTimeout(() => fail(new Error("chrome did not expose DevTools")), 15_000);
    child.stderr.on("data", onData);
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`chrome exited early (${code})`)));
  });
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const listeners = [];
    let nextId = 1;
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
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

async function evaluate(cdp, sessionId, expression, timeoutMs = 180_000) {
  const result = await Promise.race([
    cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId),
    sleep(timeoutMs).then(() => {
      throw new Error(`evaluation timed out: ${expression.slice(0, 70)}`);
    }),
  ]);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitForHarness(cdp, sessionId) {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    if (
      await evaluate(
        cdp,
        sessionId,
        "typeof window.__SKRIUW_RENDERER_STORE__ !== 'undefined'",
        10_000,
      )
    ) {
      return;
    }
    await sleep(200);
  }
  throw new Error("renderer-store harness did not become ready");
}

async function dispatchArrowDown(cdp, sessionId) {
  const key = {
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
    nativeVirtualKeyCode: 40,
  };
  await cdp.send("Input.dispatchKeyEvent", { ...key, type: "rawKeyDown" }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { ...key, type: "keyUp" }, sessionId);
}

function traceSummary(events) {
  const samples = events
    .filter(
      (event) =>
        event.name === "EventDispatch" &&
        event.args?.data?.type === "keydown" &&
        typeof event.dur === "number",
    )
    .map((event) => event.dur / 1_000)
    .sort((left, right) => left - right);
  const at = (fraction) => samples[Math.ceil(samples.length * fraction) - 1] ?? 0;
  return {
    count: samples.length,
    samplesMs: samples,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: samples.at(-1) ?? 0,
  };
}

function renderInvariantFailures(benchmark) {
  const failures = [];
  const byName = new Map(benchmark.scenarios.map((scenario) => [scenario.name, scenario]));
  const assertAllowed = (name, allowed, expected) => {
    const scenario = byName.get(name);
    if (!scenario) {
      failures.push(`${name}: missing scenario`);
      return;
    }
    const expectedRows = scenario.expectedTreeRowRenders;
    const allowedComponents = [...allowed, ...Object.keys(expectedRows)];
    const unexpected = Object.keys(scenario.renders).filter((component) => !allowedComponents.includes(component));
    if (unexpected.length > 0) {
      failures.push(`${name}: unexpected renders ${unexpected.join(", ")}`);
    }
    for (const [component, count] of Object.entries(expected)) {
      if ((scenario.renders[component] ?? 0) !== count) {
        failures.push(`${name}: ${component} rendered ${scenario.renders[component] ?? 0}, expected ${count}`);
      }
    }
    for (const [component, count] of Object.entries(expectedRows)) {
      if (scenario.renders[component] !== count) {
        failures.push(`${name}: ${component} rendered ${scenario.renders[component] ?? 0}, expected ${count}`);
      }
    }
    if (benchmark.profileBuild) {
      const allowedProfiles = ["renderer-store", ...allowedComponents];
      const unexpectedProfiles = Object.keys(scenario.profiledRenders).filter(
        (component) => !allowedProfiles.includes(component),
      );
      if (unexpectedProfiles.length > 0) {
        failures.push(`${name}: unexpected profiled renders ${unexpectedProfiles.join(", ")}`);
      }
      for (const [component, count] of Object.entries(expected)) {
        if ((scenario.profiledRenders[component] ?? 0) !== count) {
          failures.push(
            `${name}: profiled ${component} rendered ${scenario.profiledRenders[component] ?? 0}, expected ${count}`,
          );
        }
      }
      for (const [component, count] of Object.entries(expectedRows)) {
        if (scenario.profiledRenders[component] !== count) {
          failures.push(
            `${name}: profiled ${component} rendered ${scenario.profiledRenders[component] ?? 0}, expected ${count}`,
          );
        }
      }
      if ((scenario.profiledRenders["renderer-store"] ?? 0) !== scenario.commits) {
        failures.push(
          `${name}: root Profiler reported ${scenario.profiledRenders["renderer-store"] ?? 0}, expected ${scenario.commits}`,
        );
      }
    }
  };
  const assertCommits = (name, count) => {
    const scenario = byName.get(name);
    if (benchmark.profileBuild && scenario && scenario.commits !== count) {
      failures.push(`${name}: ${scenario.commits} commits, expected ${count}`);
    }
  };
  assertAllowed(
    "selection-diagnostic-100",
    ["EditorSelectionConsumer", "MetadataTitle", "MetadataWordCount"],
    { EditorSelectionConsumer: 99, MetadataTitle: 99, MetadataWordCount: 99 },
  );
  assertCommits("selection-diagnostic-100", 99);
  assertAllowed(
    "direct-active-note-100",
    ["EditorSelectionConsumer", "MetadataTitle", "MetadataWordCount"],
    { EditorSelectionConsumer: 100, MetadataTitle: 100, MetadataWordCount: 100 },
  );
  assertCommits("direct-active-note-100", 100);
  const expansion = byName.get("expand-collapse-40");
  const expansionCount = expansion?.samplesMs.length === 40 && expansion.notifications > 0 ? 40 : 0;
  assertAllowed("expand-collapse-40", ["TreeHost"], { TreeHost: expansionCount });
  if (benchmark.profileBuild && expansion && expansion.commits !== expansionCount) {
    failures.push(`expand-collapse-40: ${expansion.commits} commits, expected ${expansionCount}`);
  }
  for (const name of [
    "editor-owned-typing-30",
    "equivalent-update-100",
    "subscription-setup-100",
    "subscription-teardown-100",
  ]) {
    assertAllowed(name, [], {});
    const scenario = byName.get(name);
    if (scenario && (scenario.notifications !== 0 || scenario.commits !== 0)) {
      failures.push(`${name}: expected zero notifications and commits`);
    }
  }
  assertAllowed("metadata-title-30", ["MetadataTitle"], { MetadataTitle: 30 });
  assertCommits("metadata-title-30", 30);
  return failures;
}

async function runContext(baseUrl, fixture, label, resultsDir) {
  const profileDir = await mkdtemp(join(tmpdir(), "skriuw-renderer-store-"));
  let child;
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const launched = await launchChrome(profileDir);
    child = launched.child;
    const { wsUrl } = launched;
    const cdp = await connectCdp(wsUrl);
    const version = await cdp.send("Browser.getVersion");
    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    cdp.on("Runtime.consoleAPICalled", (params, eventSession) => {
      if (eventSession === sessionId && params.type === "error") {
        consoleErrors.push(params.args.map((arg) => arg.description ?? arg.value).join(" "));
      }
    });
    cdp.on("Runtime.exceptionThrown", (params, eventSession) => {
      if (eventSession === sessionId) {
        pageErrors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      }
    });
    await cdp.send("Page.navigate", { url: `${baseUrl}/?fixture=${fixture}` }, sessionId);
    await waitForHarness(cdp, sessionId);
    const benchmark = await evaluate(cdp, sessionId, "window.__SKRIUW_RENDERER_STORE__.run()");
    const galleryChecks = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_RENDERER_STORE__.galleryChecks()",
    );
    const trustedPreparation = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_RENDERER_STORE__.prepareTrusted()",
    );
    const lifecycleChecks = {
      overlappingTrustedRejected: await evaluate(
        cdp,
        sessionId,
        "(() => { try { window.__SKRIUW_RENDERER_STORE__.prepareTrusted(); return false; } catch { return true; } })()",
      ),
      concurrentRunRejected: await evaluate(
        cdp,
        sessionId,
        "(async () => { try { await window.__SKRIUW_RENDERER_STORE__.run(); return false; } catch { return true; } })()",
      ),
      destroyDuringCaptureRejected: await evaluate(
        cdp,
        sessionId,
        "(() => { try { window.__SKRIUW_RENDERER_STORE__.destroy(); return false; } catch { return true; } })()",
      ),
    };
    const traceEvents = [];
    let traceComplete;
    let traceFinished = false;
    cdp.on("Tracing.dataCollected", (params) => traceEvents.push(...params.value));
    const completed = new Promise((resolve) => {
      traceComplete = resolve;
    });
    cdp.on("Tracing.tracingComplete", () => {
      traceFinished = true;
      traceComplete();
    });
    await cdp.send("Tracing.start", {
      traceConfig: { includedCategories: ["devtools.timeline", "input"] },
      transferMode: "ReportEvents",
    });
    for (const anchor of trustedPreparation.anchors) {
      const expectedId = await evaluate(
        cdp,
        sessionId,
        `window.__SKRIUW_RENDERER_STORE__.positionTrusted(${JSON.stringify(anchor)})`,
      );
      await dispatchArrowDown(cdp, sessionId);
      await evaluate(
        cdp,
        sessionId,
        `window.__SKRIUW_RENDERER_STORE__.confirmTrusted(${JSON.stringify(expectedId)})`,
      );
      await sleep(KEY_INTERVAL_MS);
    }
    await sleep(250);
    await cdp.send("Tracing.end");
    await Promise.race([completed, sleep(20_000)]);
    if (!traceFinished) {
      throw new Error("Chrome trace did not complete before timeout");
    }
    const trusted = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_RENDERER_STORE__.finishTrusted()",
    );
    lifecycleChecks.unarmedFinishRejected = await evaluate(
      cdp,
      sessionId,
      "(async () => { try { await window.__SKRIUW_RENDERER_STORE__.finishTrusted(); return false; } catch { return true; } })()",
    );
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
    const teardownListeners = await evaluate(
      cdp,
      sessionId,
      "window.__SKRIUW_RENDERER_STORE__.destroy()",
    );
    const failedChecks = [...benchmark.correctness, ...galleryChecks].filter((check) => !check.pass);
    if (failedChecks.length > 0) {
      throw new Error(`correctness failures: ${JSON.stringify(failedChecks)}`);
    }
    if (trusted.keydownCount !== KEY_COUNT) {
      throw new Error(`trusted key count ${trusted.keydownCount} != ${KEY_COUNT}`);
    }
    if (trusted.selectionCount !== KEY_COUNT) {
      throw new Error(`trusted selection count ${trusted.selectionCount} != ${KEY_COUNT}`);
    }
    const traceKeydown = traceSummary(traceEvents);
    if (traceKeydown.count !== KEY_COUNT) {
      throw new Error(`trace keydown count ${traceKeydown.count} != ${KEY_COUNT}`);
    }
    const renderFailures = renderInvariantFailures(benchmark);
    if (renderFailures.length > 0) {
      throw new Error(`render invariant failures: ${JSON.stringify(renderFailures)}`);
    }
    if (Object.values(lifecycleChecks).some((pass) => !pass)) {
      throw new Error(`lifecycle guard failure: ${JSON.stringify(lifecycleChecks)}`);
    }
    if (benchmark.diagnostics.listenerLeak !== 0 || teardownListeners !== 0) {
      throw new Error(`subscriber leak: ${benchmark.diagnostics.listenerLeak}/${teardownListeners}`);
    }
    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(`browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }
    const record = {
      label,
      fixture,
      baseUrl,
      browser: version.product,
      benchmark,
      galleryChecks,
      trusted,
      lifecycleChecks,
      trustedPreparation,
      traceKeydown,
      consoleErrors,
      pageErrors,
      teardownListeners,
      measuredAt: new Date().toISOString(),
    };
    await writeFile(join(resultsDir, `${label}-${fixture}.json`), `${JSON.stringify(record, null, 2)}\n`);
    await writeFile(join(resultsDir, `${label}-${fixture}.png`), Buffer.from(screenshot.data, "base64"));
    cdp.close();
    return record;
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGKILL");
      await exited;
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await rm(profileDir, { recursive: true, force: true });
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

const [baseUrl = "http://127.0.0.1:4175", label = "production", ...fixtures] = process.argv.slice(2);
const selectedFixtures = fixtures.length > 0 ? fixtures : ["nested-5000"];
const root = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(root, "..", "results");
await mkdir(resultsDir, { recursive: true });
for (const fixture of selectedFixtures) {
  const record = await runContext(baseUrl, fixture, label, resultsDir);
  const selection = record.benchmark.scenarios.find(
    (scenario) => scenario.name === "selection-diagnostic-100",
  );
  console.log(
    `${label}/${fixture}: selection P95=${selection.timing.p95Ms.toFixed(2)} max=${selection.timing.maxMs.toFixed(2)} commits=${selection.commits} rows=${record.benchmark.dom.renderedRows} trusted=${record.trusted.keydownCount}`,
  );
}
process.exit(0);
