import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const chromeBinary = process.env.CHROME_BINARY ?? "google-chrome-stable";
export const webkitDriverBinary = process.env.WEBKIT_WEBDRIVER ?? "WebKitWebDriver";
export const webkitBrowserBinary =
  process.env.WEBKIT_BROWSER ?? "/usr/lib/webkit2gtk-4.1/MiniBrowser";

const WINDOW_WIDTH = 1440;
const WINDOW_HEIGHT = 1000;
const WEBDRIVER_KEYS = {
  Enter: "",
  ArrowRight: "",
  Shift: "",
};

export function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

async function stopProcess(child, signal = "SIGKILL") {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.kill(signal);
  await Promise.race([exited, sleep(5_000)]);
}

async function removeDirectoryWithRetry(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error?.code !== "ENOTEMPTY" || attempt === 19) {
        throw error;
      }
      await sleep(100);
    }
  }
}

function launchChrome(profileDirectory, headed) {
  return new Promise((resolveLaunch, reject) => {
    const child = spawn(
      chromeBinary,
      [
        ...(headed ? [] : ["--headless=new"]),
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDirectory}`,
        `--window-size=${WINDOW_WIDTH},${WINDOW_HEIGHT}`,
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
    function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      reject(error);
    }
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
          socket.send(
            JSON.stringify({ id, method, params: parameters, ...(sessionId ? { sessionId } : {}) }),
          );
          return new Promise((resolveCall, rejectCall) =>
            pending.set(id, { resolveCall, rejectCall }),
          );
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

/**
 * @name launchChromeDriver
 * @description Starts Chrome with a fresh profile and drives one page over the DevTools
 * protocol: evaluation, trusted key, mouse and wheel input, console capture and tracing.
 * @example
 * const driver = await launchChromeDriver({ headed: false });
 * await driver.open(url);
 */
export async function launchChromeDriver({ headed }) {
  const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-product-renderer-"));
  let chrome;
  try {
    const launched = await launchChrome(profileDirectory, headed);
    chrome = launched.child;
    const cdp = await connectCdp(launched.wsUrl);
    const version = await cdp.send("Browser.getVersion");
    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;
    const consoleErrors = [];
    const pageErrors = [];
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    cdp.on("Runtime.consoleAPICalled", (parameters, eventSession) => {
      if (eventSession === sessionId && parameters.type === "error") {
        consoleErrors.push(
          parameters.args.map((argument) => argument.description ?? argument.value).join(" "),
        );
      }
    });
    cdp.on("Runtime.exceptionThrown", (parameters, eventSession) => {
      if (eventSession === sessionId) {
        pageErrors.push(
          parameters.exceptionDetails.exception?.description ?? parameters.exceptionDetails.text,
        );
      }
    });
    const traceEvents = [];
    let finishTrace = null;
    cdp.on("Tracing.dataCollected", (parameters) => traceEvents.push(...parameters.value));
    cdp.on("Tracing.tracingComplete", () => finishTrace?.());

    async function evaluate(expression, timeoutMilliseconds = 180_000) {
      const result = await Promise.race([
        cdp.send(
          "Runtime.evaluate",
          { expression, awaitPromise: true, returnByValue: true },
          sessionId,
        ),
        sleep(timeoutMilliseconds).then(() => {
          throw new Error(`evaluation timed out: ${expression.slice(0, 80)}`);
        }),
      ]);
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
        );
      }
      return result.result.value;
    }

    async function mouse(type, point, extra = {}) {
      await cdp.send(
        "Input.dispatchMouseEvent",
        { type, x: point.x, y: point.y, ...extra },
        sessionId,
      );
    }

    return {
      name: "chrome",
      version: version.product,
      binary: chromeBinary,
      supportsTrace: true,
      wheelScrolls: true,
      consoleErrors,
      pageErrors,
      async open(url) {
        await cdp.send("Page.navigate", { url }, sessionId);
      },
      evaluate,
      async key({ key, code, keyCode, text, shift = false }) {
        const common = {
          key,
          code,
          windowsVirtualKeyCode: keyCode,
          nativeVirtualKeyCode: keyCode,
          modifiers: shift ? 8 : 0,
        };
        await cdp.send("Input.dispatchKeyEvent", { ...common, type: "rawKeyDown" }, sessionId);
        if (text) {
          await cdp.send(
            "Input.dispatchKeyEvent",
            { ...common, type: "char", text, unmodifiedText: text },
            sessionId,
          );
        }
        await cdp.send("Input.dispatchKeyEvent", { ...common, type: "keyUp" }, sessionId);
      },
      async click(point) {
        await mouse("mouseMoved", point);
        await mouse("mousePressed", point, { button: "left", clickCount: 1 });
        await mouse("mouseReleased", point, { button: "left", clickCount: 1 });
      },
      async wheel(point, deltaY) {
        await mouse("mouseWheel", point, { deltaX: 0, deltaY });
      },
      async startTrace(categories) {
        traceEvents.length = 0;
        await cdp.send("Tracing.start", {
          traceConfig: { includedCategories: categories },
          transferMode: "ReportEvents",
        });
      },
      async stopTrace() {
        const complete = new Promise((resolveTrace) => {
          finishTrace = resolveTrace;
        });
        await cdp.send("Tracing.end");
        const finished = await Promise.race([complete.then(() => true), sleep(20_000)]);
        finishTrace = null;
        if (!finished) {
          throw new Error("Chrome trace did not complete before timeout");
        }
        return [...traceEvents];
      },
      async close() {
        cdp.close();
        await stopProcess(chrome);
        await removeDirectoryWithRetry(profileDirectory);
      },
    };
  } catch (error) {
    await stopProcess(chrome);
    await removeDirectoryWithRetry(profileDirectory);
    throw error;
  }
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function startXvfb() {
  return new Promise((resolveStart, reject) => {
    const child = spawn(
      "Xvfb",
      [
        "-displayfd",
        "3",
        "-screen",
        "0",
        `${WINDOW_WIDTH}x${WINDOW_HEIGHT}x24`,
        "-nolisten",
        "tcp",
      ],
      { stdio: ["ignore", "ignore", "ignore", "pipe"] },
    );
    const timeout = setTimeout(() => reject(new Error("Xvfb did not report a display")), 10_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Xvfb failed to start: ${error.message}`));
    });
    child.stdio[3].once("data", (chunk) => {
      clearTimeout(timeout);
      resolveStart({ child, display: `:${String(chunk).trim()}` });
    });
  });
}

/**
 * @name launchWebKitDriver
 * @description Starts the system WebKitGTK MiniBrowser through WebKitWebDriver, on a private
 * Xvfb display unless headed, and drives one page over W3C WebDriver. WebKitGTK exposes no
 * trace and no console capture, so `stopTrace` returns null and errors come from the page.
 * Its wheel actions fire trusted `wheel` events without scrolling, so `wheelScrolls` is false.
 * @example
 * const driver = await launchWebKitDriver({ headed: false });
 * await driver.open(url);
 */
export async function launchWebKitDriver({ headed }) {
  let xvfb = null;
  let webdriver = null;
  try {
    const environment = { ...process.env };
    if (!headed) {
      xvfb = await startXvfb();
      environment.DISPLAY = xvfb.display;
      environment.GDK_BACKEND = "x11";
      delete environment.WAYLAND_DISPLAY;
    }
    const port = await freePort();
    webdriver = spawn(webkitDriverBinary, [`--port=${port}`], {
      env: environment,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const spawnFailure = new Promise((_, reject) =>
      webdriver.once("error", (error) =>
        reject(new Error(`${webkitDriverBinary} failed to start: ${error.message}`)),
      ),
    );
    const base = `http://127.0.0.1:${port}`;

    async function request(method, path, body) {
      const init =
        body === undefined
          ? { method }
          : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
      const response = await Promise.race([fetch(`${base}${path}`, init), spawnFailure]);
      const payload = await response.json();
      if (payload.value?.error) {
        throw new Error(`${payload.value.error}: ${payload.value.message}`);
      }
      return payload.value;
    }

    for (let attempt = 0; ; attempt += 1) {
      try {
        await request("GET", "/status");
        break;
      } catch (error) {
        if (attempt === 50) {
          throw error;
        }
        await sleep(100);
      }
    }
    const created = await request("POST", "/session", {
      capabilities: {
        alwaysMatch: {
          "webkitgtk:browserOptions": { binary: webkitBrowserBinary, args: ["--automation"] },
        },
      },
    });
    const session = `/session/${created.sessionId}`;
    await request("POST", `${session}/timeouts`, { script: 180_000, pageLoad: 60_000 });
    await request("POST", `${session}/window/rect`, {
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
    });

    async function actions(source) {
      await request("POST", `${session}/actions`, { actions: [source] });
    }

    function keyValue(key, text) {
      return WEBDRIVER_KEYS[key] ?? text ?? key;
    }

    return {
      name: "webkit",
      version: `WebKitGTK ${created.capabilities.browserVersion}`,
      binary: `${webkitDriverBinary} + ${webkitBrowserBinary}`,
      supportsTrace: false,
      wheelScrolls: false,
      consoleErrors: [],
      pageErrors: [],
      async open(url) {
        await request("POST", `${session}/url`, { url });
      },
      async evaluate(expression) {
        return request("POST", `${session}/execute/sync`, {
          script: `return Promise.resolve(${expression});`,
          args: [],
        });
      },
      async key({ key, text, shift = false }) {
        const value = keyValue(key, text);
        await actions({
          type: "key",
          id: "keyboard",
          actions: [
            ...(shift ? [{ type: "keyDown", value: WEBDRIVER_KEYS.Shift }] : []),
            { type: "keyDown", value },
            { type: "keyUp", value },
            ...(shift ? [{ type: "keyUp", value: WEBDRIVER_KEYS.Shift }] : []),
          ],
        });
      },
      async click(point) {
        await actions({
          type: "pointer",
          id: "mouse",
          parameters: { pointerType: "mouse" },
          actions: [
            { type: "pointerMove", x: point.x, y: point.y, duration: 0 },
            { type: "pointerDown", button: 0 },
            { type: "pointerUp", button: 0 },
          ],
        });
      },
      async wheel(point, deltaY) {
        await actions({
          type: "wheel",
          id: "wheel",
          actions: [{ type: "scroll", x: point.x, y: point.y, deltaX: 0, deltaY, duration: 0 }],
        });
      },
      async startTrace() {},
      async stopTrace() {
        return null;
      },
      async close() {
        await request("DELETE", session).catch((error) => {
          process.stderr.write(`WebKit session did not close cleanly: ${error.message}\n`);
        });
        await stopProcess(webdriver, "SIGTERM");
        await stopProcess(xvfb?.child, "SIGTERM");
      },
    };
  } catch (error) {
    await stopProcess(webdriver);
    await stopProcess(xvfb?.child);
    throw error;
  }
}
