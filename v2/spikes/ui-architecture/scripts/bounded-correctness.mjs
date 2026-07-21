import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preview } from "vite";

const CHROME_BINARY = process.env.CHROME_BINARY ?? "google-chrome-stable";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function launchChrome(profileDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      CHROME_BINARY,
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
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      reject(error);
    };
    const onData = (chunk) => {
      buffered += String(chunk);
      const match = buffered.match(/DevTools listening on (ws:\/\/\S+)/);
      if (!match) return;
      settled = true;
      clearTimeout(timeout);
      child.stderr.off("data", onData);
      resolve({ child, websocketUrl: match[1] });
    };
    const timeout = setTimeout(() => fail(new Error("Chrome did not expose DevTools")), 15_000);
    child.stderr.on("data", onData);
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`Chrome exited early (${code})`)));
  });
}

function connect(websocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(websocketUrl);
    const pending = new Map();
    const listeners = [];
    let nextId = 1;
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
          return new Promise((resolveCall, rejectCall) => {
            pending.set(id, { resolveCall, rejectCall });
          });
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
        if (message.error) call?.rejectCall(new Error(message.error.message));
        else call?.resolveCall(message.result);
        return;
      }
      for (const listener of listeners) {
        if (listener.method === message.method) listener.handler(message.params, message.sessionId);
      }
    });
  });
}

async function evaluate(client, sessionId, expression) {
  const result = await Promise.race([
    client.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    ),
    sleep(180_000).then(() => {
      throw new Error("browser correctness evaluation timed out");
    }),
  ]);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitForHarness(client, sessionId) {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    const ready = await evaluate(
      client,
      sessionId,
      "typeof window.__SKRIUW_BENCHMARK__ !== 'undefined'",
    );
    if (ready) return;
    await sleep(200);
  }
  throw new Error("editor harness did not become ready");
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-bounded-editor-"));
const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
const address = server.httpServer.address();
if (!address || typeof address === "string") throw new Error("Vite preview did not expose a port");
let chrome;
let client;
const consoleErrors = [];
const pageErrors = [];

try {
  const launched = await launchChrome(profileDirectory);
  chrome = launched.child;
  client = await connect(launched.websocketUrl);
  const target = await client.send("Target.createTarget", { url: "about:blank" });
  const attached = await client.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;
  await client.send("Runtime.enable", {}, sessionId);
  await client.send("Page.enable", {}, sessionId);
  client.on("Runtime.consoleAPICalled", (params, eventSession) => {
    if (eventSession === sessionId && params.type === "error") {
      consoleErrors.push(params.args.map((argument) => argument.description ?? argument.value).join(" "));
    }
  });
  client.on("Runtime.exceptionThrown", (params, eventSession) => {
    if (eventSession === sessionId) {
      pageErrors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
  await client.send("Page.navigate", { url: `http://127.0.0.1:${address.port}` }, sessionId);
  await waitForHarness(client, sessionId);
  const result = await evaluate(
    client,
    sessionId,
    `(async () => {
      const benchmark = await window.__SKRIUW_BENCHMARK__.run("prosemirror", 2000, "bounded");
      const scenario = window.__SKRIUW_BENCHMARK__.runBoundedCorrectnessScenario();
      return {
        benchmark: {
          hostMounts: benchmark.hostMounts,
          editorInstances: benchmark.editorInstances,
          activeDomNodes: benchmark.activeDomNodes,
          renderedBlocks: benchmark.renderedBlocks,
          canonicalBlocks: benchmark.canonicalBlocks,
          switchingP95Ms: benchmark.switching.settled.p95Ms,
          switchingMaxMs: benchmark.switching.settled.maxMs,
          switchingDroppedFrames: benchmark.switching.droppedFrames,
          typingP95Ms: benchmark.typing.settled.p95Ms,
          typingMaxMs: benchmark.typing.settled.maxMs,
          typingDroppedFrames: benchmark.typing.droppedFrames,
        },
        scenario: {
          start: scenario.moved.start,
          selection: scenario.moved.selection,
          domSelection: scenario.moved.domSelection,
          focused: scenario.moved.focused,
          domFocused: scenario.moved.domFocused,
          scrollTop: scenario.moved.scrollTop,
          anchoredSelectionTop: scenario.anchored.selectionTop,
          movedSelectionTop: scenario.moved.selectionTop,
          canonicalEdit: scenario.edited.canonicalTexts[scenario.edited.selection.blockIndex],
          renderedEdit: scenario.edited.renderedTexts[
            scenario.edited.selection.blockIndex - scenario.edited.start
          ],
          restoredSelection: scenario.restored.selection,
          restoredCanonicalEdit: scenario.restored.canonicalTexts[
            scenario.restored.selection.blockIndex
          ],
          restoredUndoDepth: scenario.restored.undoDepth,
          undoneCanonicalEdit: scenario.undone.canonicalTexts[
            scenario.undone.selection.blockIndex
          ],
          slashMenuOpen: scenario.slash.slashMenuOpen,
          slashMenuQuery: scenario.slash.slashMenuQuery,
          slashUndone: !scenario.slashUndone.slashMenuOpen,
          compositionGuarded: scenario.compositionGuarded,
          unsupported: scenario.unsupported,
        },
      };
    })()`,
  );
  requireEqual(result.benchmark.hostMounts, 1, "host mounts");
  requireEqual(result.benchmark.editorInstances, 1, "editor instances");
  requireEqual(result.benchmark.renderedBlocks, 192, "rendered blocks");
  requireEqual(result.benchmark.canonicalBlocks, 2_000, "canonical blocks");
  if (result.benchmark.activeDomNodes > 512) throw new Error("bounded DOM limit exceeded");
  requireEqual(result.scenario.selection.blockIndex, result.scenario.domSelection.blockIndex, "selection block");
  requireEqual(result.scenario.selection.offset, result.scenario.domSelection.offset, "selection offset");
  requireEqual(result.scenario.focused, true, "projection focus");
  requireEqual(result.scenario.domFocused, true, "DOM focus");
  if (Math.abs(result.scenario.anchoredSelectionTop - result.scenario.movedSelectionTop) > 1) {
    throw new Error("visual selection anchor moved during recycling");
  }
  requireEqual(result.scenario.canonicalEdit, result.scenario.renderedEdit, "canonical edit");
  requireEqual(
    result.scenario.selection.blockIndex,
    result.scenario.restoredSelection.blockIndex,
    "restored selection block",
  );
  requireEqual(
    result.scenario.selection.offset + 1,
    result.scenario.restoredSelection.offset,
    "restored selection offset",
  );
  requireEqual(
    result.scenario.canonicalEdit,
    result.scenario.restoredCanonicalEdit,
    "restored canonical edit",
  );
  requireEqual(result.scenario.restoredUndoDepth, 1, "restored undo depth");
  requireEqual(
    result.scenario.undoneCanonicalEdit,
    "Canonical reconciliation remains visible",
    "undone canonical edit",
  );
  requireEqual(result.scenario.slashMenuOpen, true, "slash menu state");
  requireEqual(result.scenario.slashMenuQuery, "heading", "slash menu query");
  requireEqual(result.scenario.slashUndone, true, "slash menu undo");
  requireEqual(result.scenario.compositionGuarded, true, "composition guard");
  requireEqual(consoleErrors.length, 0, "console errors");
  requireEqual(pageErrors.length, 0, "page errors");
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  client?.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) chrome.kill("SIGKILL");
  await server.close();
  await rm(profileDirectory, { recursive: true, force: true });
}

process.exit(0);
