import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  connectCdp,
  delay,
  evaluate,
  launchChrome,
  startViteServer,
  stopProcess,
  waitFor,
  waitForServer,
} from "./chrome-harness.mjs";

/**
 * Drives the corrupt-database escape hatch against the real application shell:
 * a workspace that cannot open must offer "Reset workspace…", confirm before
 * deleting, and come back up on an empty workspace. The unit suite covers the
 * flow's states; only a browser can prove the button reaches OPFS.
 */

const appDirectory = new URL("..", import.meta.url).pathname;
const port = 4194;
const baseUrl = `http://127.0.0.1:${port}`;
const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-browser-reset-"));
let server;
let browser;
let socket;

const APP_BOOTED = `Boolean(document.querySelector('[data-app-shell], main, [data-testid="app-shell"]')) && !document.querySelector('[role="alert"]')`;
const FAILURE_SHOWN = `Boolean(document.querySelector('[role="alert"]'))`;
const SCREEN_TEXT = `document.querySelector('[role="alert"]')?.innerText ?? ""`;
const BUTTON_LABELS = `Array.from(document.querySelectorAll('[role="alert"] button')).map((button) => button.textContent)`;

function pressButton(label) {
  return `(() => {
    const button = Array.from(document.querySelectorAll('[role="alert"] button'))
      .find((candidate) => candidate.textContent === ${JSON.stringify(label)});
    if (!button) throw new Error("missing button: " + ${JSON.stringify(label)});
    if (button.disabled) throw new Error("disabled button: " + ${JSON.stringify(label)});
    button.click();
    return true;
  })()`;
}

try {
  server = startViteServer(appDirectory, port);
  await waitForServer(server, baseUrl);
  const launched = await launchChrome(profileDirectory);
  browser = launched.child;
  socket = await connectCdp(launched.webSocketUrl);
  const cdp = socket;
  const { targetId } = await cdp.send("Target.createTarget", { url: `${baseUrl}/` });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);

  await waitFor(cdp, sessionId, APP_BOOTED, "first application boot", 600);

  // The storage worker holds the pool files exclusively, so the corruption is
  // written from a bare page on the same origin after the app tab lets go.
  await navigate(cdp, sessionId, `${baseUrl}/e2e/browser-reset.html`);
  await waitFor(cdp, sessionId, "window.browserResetE2e !== undefined", "corruption module");
  const corrupted = await evaluate(
    cdp,
    sessionId,
    "window.browserResetE2e.corruptDatabase().then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }))",
  );
  if (!corrupted.ok) throw new Error(`could not corrupt the workspace: ${corrupted.error}`);

  await navigate(cdp, sessionId, `${baseUrl}/`);
  await waitFor(cdp, sessionId, FAILURE_SHOWN, "startup failure screen", 600);
  const failureText = await evaluate(cdp, sessionId, SCREEN_TEXT);
  if (!failureText.includes("could not open your workspace")) {
    throw new Error(`unexpected startup screen: ${JSON.stringify(failureText)}`);
  }
  const labels = await evaluate(cdp, sessionId, BUTTON_LABELS);
  if (!labels.includes("Reset workspace…")) {
    throw new Error(`corrupt database offered no reset: ${JSON.stringify(labels)}`);
  }

  await evaluate(cdp, sessionId, pressButton("Reset workspace…"));
  await waitFor(
    cdp,
    sessionId,
    `${SCREEN_TEXT}.includes("Delete this browser workspace?")`,
    "reset confirmation",
  );

  // Cancelling must leave the database in place, so the failure screen returns
  // with the reset still on offer rather than an emptied workspace.
  await evaluate(cdp, sessionId, pressButton("Cancel"));
  await waitFor(
    cdp,
    sessionId,
    `${SCREEN_TEXT}.includes("could not open your workspace")`,
    "cancelled confirmation",
  );

  await evaluate(cdp, sessionId, pressButton("Reset workspace…"));
  await waitFor(
    cdp,
    sessionId,
    `${SCREEN_TEXT}.includes("Delete this browser workspace?")`,
    "reset confirmation after cancel",
  );
  await evaluate(cdp, sessionId, pressButton("Delete and reload"));

  await waitFor(cdp, sessionId, APP_BOOTED, "application boot after reset", 900);

  await navigate(cdp, sessionId, `${baseUrl}/e2e/browser-reset.html`);
  await waitFor(cdp, sessionId, "window.browserResetE2e !== undefined", "corruption module reload");
  const slots = await evaluate(cdp, sessionId, "window.browserResetE2e.workspaceFileCount()");

  process.stdout.write(
    `browser workspace reset passed: corrupted ${corrupted.value.file} (${corrupted.value.size} bytes), cancel preserved the failure, reset rebuilt ${slots} pool slots\n`,
  );
} finally {
  socket?.close();
  await stopProcess(browser, "SIGKILL");
  await stopProcess(server, "SIGTERM");
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function navigate(cdp, sessionId, url) {
  await cdp.send("Page.navigate", { url }, sessionId);
  await delay(300);
}
