#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appUrl = new URL(process.argv[2] ?? "https://skriuw.com/app/");
const chromeBinary = process.env.CHROME_BINARY ?? "google-chrome-stable";
const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-live-smoke-"));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let browser;
let socket;

try {
  await verifyStaticDeployment(appUrl);
  const launched = await launchChrome(profileDirectory);
  browser = launched.child;
  const cdp = await connectCdp(launched.webSocketUrl);
  socket = cdp;
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;
  const pageErrors = [];
  const consoleErrors = [];
  cdp.on("Runtime.exceptionThrown", (parameters, eventSession) => {
    if (eventSession !== sessionId) return;
    pageErrors.push(parameters.exceptionDetails.exception?.description ?? parameters.exceptionDetails.text);
  });
  cdp.on("Runtime.consoleAPICalled", (parameters, eventSession) => {
    if (eventSession !== sessionId || parameters.type !== "error") return;
    consoleErrors.push(parameters.args.map((argument) => argument.description ?? argument.value).join(" "));
  });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Page.navigate", { url: appUrl.toString() }, sessionId);

  let state;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    state = await evaluate(
      cdp,
      sessionId,
      `({
        readyState: document.readyState,
        rootChildren: document.querySelector("#root")?.childElementCount ?? 0,
        text: document.body?.innerText.slice(0, 240) ?? ""
      })`,
    );
    if (state.rootChildren > 0 || pageErrors.length > 0) break;
    await delay(100);
  }

  if (!state || state.rootChildren === 0 || pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(
      `live browser bootstrap failed: ${JSON.stringify({ state, pageErrors, consoleErrors })}`,
    );
  }
  process.stdout.write(
    `web deployment passed: ${appUrl.origin}${appUrl.pathname} rendered with browser-local storage\n`,
  );
} finally {
  socket?.close();
  await stopProcess(browser);
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function verifyStaticDeployment(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`app shell returned HTTP ${response.status}`);
  const html = await response.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/gu)].map((match) => match[1]);
  const wasmAsset = assets.find((asset) => asset.endsWith(".wasm"));
  const scriptAsset = assets.find((asset) => asset.endsWith(".js"));
  if (!scriptAsset) throw new Error("app shell has no production script asset");
  const scriptResponse = await fetch(new URL(scriptAsset, url), { method: "HEAD" });
  if (!scriptResponse.ok) throw new Error(`app script returned HTTP ${scriptResponse.status}`);

  // The WASM URL is emitted by the worker chunk rather than the HTML shell.
  const script = await fetch(new URL(scriptAsset, url)).then((result) => result.text());
  const emittedScripts = [
    scriptAsset,
    ...script.matchAll(/\/app\/assets\/[A-Za-z0-9_-]+\.js/gu),
  ].map((match) => (typeof match === "string" ? match : match[0]));
  let emittedWasm = wasmAsset;
  for (const emittedScript of new Set(emittedScripts)) {
    const source = await fetch(new URL(emittedScript, url)).then((result) => result.text());
    emittedWasm = source.match(/\/app\/assets\/[A-Za-z0-9_-]+\.wasm/u)?.[0];
    if (emittedWasm) break;
  }
  if (!emittedWasm) throw new Error("production bundle has no discoverable WASM asset");
  const wasmResponse = await fetch(new URL(emittedWasm, url), { method: "HEAD" });
  if (!wasmResponse.ok) throw new Error(`WASM asset returned HTTP ${wasmResponse.status}`);
  if (wasmResponse.headers.get("content-type") !== "application/wasm") {
    throw new Error(`WASM asset has unexpected content type: ${wasmResponse.headers.get("content-type")}`);
  }
}

function launchChrome(profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chromeBinary,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => rejectLaunch("Chrome did not expose DevTools"), 15_000);
    function rejectLaunch(message) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      reject(new Error(`${message}\n${output}`));
    }
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/u);
      if (!settled && match?.[1]) {
        settled = true;
        clearTimeout(timeout);
        resolve({ child, webSocketUrl: match[1] });
      }
    });
    child.on("error", (error) => rejectLaunch(String(error)));
    child.on("exit", (code) => rejectLaunch(`Chrome exited early (${code})`));
  });
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const connection = new WebSocket(url);
    const pending = new Map();
    const listeners = [];
    let nextId = 1;
    connection.addEventListener("open", () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          connection.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
          return new Promise((resolveCall, rejectCall) => {
            pending.set(id, { resolveCall, rejectCall, method });
          });
        },
        on(method, handler) {
          listeners.push({ method, handler });
        },
        close() {
          connection.close();
        },
      });
    });
    connection.addEventListener("error", () => reject(new Error("CDP connection failed")));
    connection.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        const call = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) call?.rejectCall(new Error(`${call.method}: ${message.error.message}`));
        else call?.resolveCall(message.result);
        return;
      }
      for (const listener of listeners) {
        if (listener.method === message.method) listener.handler(message.params, message.sessionId);
      }
    });
  });
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGKILL");
  await Promise.race([exited, delay(2_000)]);
}
