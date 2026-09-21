import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appDirectory = new URL("..", import.meta.url).pathname;
const baseUrl = "http://127.0.0.1:4194";
const firefoxBinary = process.env.FIREFOX_BINARY ?? "firefox";
const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-firefox-opfs-"));
let server;
let browser;
let session;

try {
  await writeFile(
    join(profileDirectory, "user.js"),
    [
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("browser.sessionstore.resume_from_crash", false);',
      'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
      'user_pref("app.update.disabledForTesting", true);',
      'user_pref("remote.active-protocols", 1);',
    ].join("\n"),
  );
  server = spawn("bun", ["x", "vite", "--host", "127.0.0.1", "--port", "4194"], {
    cwd: appDirectory,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(server);
  const launched = await launchFirefox(profileDirectory);
  browser = launched.child;
  session = await connectBidi(launched.webSocketUrl);
  await session.send("session.new", { capabilities: {} });
  const tree = await session.send("browsingContext.getTree", {});
  const context = tree.contexts[0].context;
  await session.send("browsingContext.navigate", {
    context,
    url: `${baseUrl}/e2e/browser-storage.html`,
    wait: "complete",
  });
  await waitFor(session, context, "window.browserStorageE2e !== undefined", "test module");

  const result = await evaluateJson(
    session,
    context,
    "window.browserStorageE2e.write().then(value => JSON.stringify({ ok: true, value }), error => JSON.stringify({ ok: false, error: String(error) }))",
  );
  if (!result.ok) throw new Error(`firefox write failed: ${JSON.stringify(result.error)}`);

  await session.send("browsingContext.reload", { context, wait: "complete" });
  await waitFor(
    session,
    context,
    "window.browserStorageE2e !== undefined",
    "reloaded test module",
  );
  const reopened = await evaluateJson(
    session,
    context,
    `window.browserStorageE2e.count(${JSON.stringify(result.value.id)}).then(count => JSON.stringify(count))`,
  );
  if (reopened !== 1) {
    throw new Error(`expected one durable folder after reopen, found ${reopened}`);
  }
  const versionExpression = "JSON.stringify(navigator.userAgent)";
  const userAgent = await evaluateJson(session, context, `Promise.resolve(${versionExpression})`);
  process.stdout.write(
    `firefox OPFS durability passed: ${result.value.initialNodes} initial nodes, one persisted write (${userAgent})\n`,
  );
} finally {
  session?.close();
  await stopProcess(browser, "SIGKILL");
  await stopProcess(server, "SIGTERM");
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function waitForServer(child) {
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before readiness (${child.exitCode})\n${stderr}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(100);
  }
  throw new Error(`Vite did not become ready\n${stderr}`);
}

function launchFirefox(profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      firefoxBinary,
      [
        "-headless",
        "-no-remote",
        "-profile",
        profile,
        "--remote-debugging-port=0",
        "about:blank",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    const timeout = setTimeout(() => rejectLaunch("Firefox did not expose WebDriver BiDi"), 20_000);
    let settled = false;
    function rejectLaunch(message) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      reject(new Error(`${message}\n${output}`));
    }
    function inspect(chunk) {
      output += String(chunk);
      const match = output.match(/WebDriver BiDi listening on (ws:\/\/\S+)/);
      if (!settled && match?.[1]) {
        settled = true;
        clearTimeout(timeout);
        const url = match[1].endsWith("/session") ? match[1] : `${match[1]}/session`;
        resolve({ child, webSocketUrl: url });
      }
    }
    child.stderr.on("data", inspect);
    child.stdout.on("data", inspect);
    child.on("error", (error) => rejectLaunch(String(error)));
    child.on("exit", (code) => rejectLaunch(`Firefox exited early (${code})`));
  });
}

function connectBidi(url) {
  return new Promise((resolve, reject) => {
    const connection = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    connection.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          connection.send(JSON.stringify({ id, method, params }));
          return new Promise((resolveCall, rejectCall) => {
            pending.set(id, { resolveCall, rejectCall, method });
          });
        },
        close() {
          connection.close();
        },
      });
    });
    connection.addEventListener("error", () => reject(new Error("BiDi connection failed")));
    connection.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) return;
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (!call) return;
      if (message.type === "error") {
        call.rejectCall(new Error(`${call.method}: ${message.error} ${message.message ?? ""}`));
      } else {
        call.resolveCall(message.result);
      }
    });
  });
}

async function evaluateJson(session, context, expression) {
  const result = await session.send("script.evaluate", {
    expression,
    target: { context },
    awaitPromise: true,
    resultOwnership: "none",
  });
  if (result.type === "exception") {
    throw new Error(result.exceptionDetails?.text ?? "script threw");
  }
  if (result.result?.type !== "string") {
    throw new Error(`expected JSON string result, got ${JSON.stringify(result.result)}`);
  }
  return JSON.parse(result.result.value);
}

async function waitFor(session, context, expression, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const ready = await evaluateJson(
      session,
      context,
      `Promise.resolve(JSON.stringify(${expression}))`,
    );
    if (ready) return;
    await delay(50);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function stopProcess(child, signal) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill(signal);
  await Promise.race([exited, delay(2_000)]);
}
