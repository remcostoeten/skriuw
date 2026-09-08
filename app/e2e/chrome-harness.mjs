import { spawn } from "node:child_process";

/**
 * Shared Chrome/CDP plumbing for the browser end-to-end drivers: a Vite server,
 * a throwaway headless profile, and a request/response CDP socket. Each driver
 * owns its own scenario and assertions.
 */

const CHROME_BINARY = process.env.CHROME_BINARY ?? "google-chrome-stable";

export function startViteServer(appDirectory, port) {
  return spawn("bun", ["x", "vite", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: appDirectory,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export async function waitForServer(child, baseUrl) {
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

export function launchChrome(profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      CHROME_BINARY,
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
    const timeout = setTimeout(() => rejectLaunch("Chrome did not expose DevTools"), 15_000);
    let settled = false;
    function rejectLaunch(message) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      reject(new Error(`${message}\n${output}`));
    }
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
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

export function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const connection = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    connection.addEventListener("open", () => {
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          connection.send(
            JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
          );
          return new Promise((resolveCall, rejectCall) => {
            pending.set(id, { resolveCall, rejectCall, method });
          });
        },
        close() {
          connection.close();
        },
      });
    });
    connection.addEventListener("error", () => reject(new Error("CDP connection failed")));
    connection.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) return;
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call?.rejectCall(new Error(`${call.method}: ${message.error.message}`));
      else call?.resolveCall(message.result);
    });
  });
}

export async function evaluate(cdp, sessionId, expression, timeoutMs = 30_000) {
  const result = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true, timeout: timeoutMs },
    sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

export async function waitFor(cdp, sessionId, expression, label, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(cdp, sessionId, expression)) return;
    await delay(50);
  }
  throw new Error(`timed out waiting for ${label}`);
}

export function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function stopProcess(child, signal) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill(signal);
  await Promise.race([exited, delay(2_000)]);
}
