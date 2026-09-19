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
 * Drives per-account local workspaces (ADR-0046) against the real browser
 * runtime: the notes written before any sign-in are claimed in place by the
 * first account, a second account reopens the tab on an empty workspace of
 * its own, and switching back and forth is lossless in both directions. The
 * unit suite covers the registry; only a browser proves that the storage
 * worker really opens a different OPFS database after the reload.
 */

const appDirectory = new URL("..", import.meta.url).pathname;
const port = Number(process.env.SKRIUW_E2E_ACCOUNT_PORT ?? 4196);
const baseUrl = `http://127.0.0.1:${port}`;
const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-browser-account-"));
let server;
let browser;
let socket;

const FIRST_ACCOUNT = `w_${"a1".repeat(32)}`;
const SECOND_ACCOUNT = `w_${"b2".repeat(32)}`;
const FIRST_NOTE = "Kept from before sign-in";
const SECOND_NOTE = "Second account note";

const APP_BOOTED = `Boolean(document.querySelector('[role="tree"]')) && !document.querySelector('[role="alert"]')`;
const TREE_TITLES = `Array.from(document.querySelectorAll('[role="treeitem"]')).map((row) => row.textContent ?? "")`;
const RUNTIME = `import("/src/bridge/runtime.ts")`;
const COMMANDS = `import("/src/bridge/commands.ts")`;

function createNoteExpression(id, title) {
  return `${COMMANDS}.then((commands) => commands.applyWorkspaceOperations([{
    protocolVersion: 1,
    operation: {
      type: "create_note",
      id: ${JSON.stringify(id)},
      title: ${JSON.stringify(title)},
      placement: { parentId: null, position: { type: "last" } },
      documentJson: { type: "doc", content: [] },
      markdown: "",
      at: Date.now(),
    },
  }])).then(() => true)`;
}

function adoptExpression(workspaceId) {
  return `${RUNTIME}.then((runtime) => runtime.invoke("adopt_workspace_slot", { workspaceId: ${JSON.stringify(workspaceId)} }))`;
}

const ACTIVE_SLOT = `${RUNTIME}.then((runtime) => runtime.invoke("active_workspace_slot"))`;

try {
  server = startViteServer(appDirectory, port);
  await waitForServer(server, baseUrl);
  const launched = await launchChrome(profileDirectory);
  browser = launched.child;
  socket = await connectCdp(launched.webSocketUrl);
  const cdp = socket;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  // The sidebar tree only mounts in the wide shell; the compact shell keeps it
  // in a sheet that would hide every title this run asserts on.
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );

  await navigate(cdp, sessionId, `${baseUrl}/`);
  await waitFor(cdp, sessionId, APP_BOOTED, "first application boot", 600);
  if ((await evaluate(cdp, sessionId, ACTIVE_SLOT)) !== null) {
    throw new Error("a fresh profile already had an owning account");
  }

  await evaluate(cdp, sessionId, createNoteExpression("note-before-sign-in", FIRST_NOTE));
  await reload(cdp, sessionId, "boot with the pre-sign-in note");
  await expectTitles(cdp, sessionId, { present: [FIRST_NOTE], absent: [SECOND_NOTE] }, "before any sign-in");

  const claimed = await evaluate(cdp, sessionId, adoptExpression(FIRST_ACCOUNT));
  if (claimed !== "claimed") throw new Error(`first sign-in did not claim the workspace: ${claimed}`);
  if ((await evaluate(cdp, sessionId, ACTIVE_SLOT)) !== FIRST_ACCOUNT) {
    throw new Error("the claimed workspace is not the active one");
  }
  await reload(cdp, sessionId, "boot after the claim");
  await expectTitles(cdp, sessionId, { present: [FIRST_NOTE], absent: [] }, "after the first account claimed it in place");

  const active = await evaluate(cdp, sessionId, adoptExpression(FIRST_ACCOUNT));
  if (active !== "active") throw new Error(`signing into the owner again was not a no-op: ${active}`);

  await switchAccount(cdp, sessionId, SECOND_ACCOUNT, "second account");
  await expectTitles(cdp, sessionId, { present: [], absent: [FIRST_NOTE] }, "on the second account's fresh workspace");
  if ((await evaluate(cdp, sessionId, ACTIVE_SLOT)) !== SECOND_ACCOUNT) {
    throw new Error("the second account's workspace is not the active one after the reload");
  }
  await evaluate(cdp, sessionId, createNoteExpression("note-second-account", SECOND_NOTE));
  await reload(cdp, sessionId, "boot with the second account's note");
  await expectTitles(cdp, sessionId, { present: [SECOND_NOTE], absent: [FIRST_NOTE] }, "after writing on the second account");

  await switchAccount(cdp, sessionId, FIRST_ACCOUNT, "first account again");
  await expectTitles(cdp, sessionId, { present: [FIRST_NOTE], absent: [SECOND_NOTE] }, "back on the first account");

  await switchAccount(cdp, sessionId, SECOND_ACCOUNT, "second account again");
  await expectTitles(cdp, sessionId, { present: [SECOND_NOTE], absent: [FIRST_NOTE] }, "back on the second account");

  const registry = await evaluate(
    cdp,
    sessionId,
    `JSON.parse(localStorage.getItem("skriuw.workspace-slots.v1") ?? "null")`,
  );
  if (
    registry?.active !== SECOND_ACCOUNT ||
    registry?.slots?.[FIRST_ACCOUNT] !== "" ||
    registry?.slots?.[SECOND_ACCOUNT] !== SECOND_ACCOUNT
  ) {
    throw new Error(`unexpected workspace registry: ${JSON.stringify(registry)}`);
  }

  await openAccountSettings(cdp, sessionId);
  const panelText = await evaluate(
    cdp,
    sessionId,
    `document.getElementById("settings-tabpanel")?.innerText ?? ""`,
  );
  for (const expected of [
    "Notes on this device",
    "Linked to a cloud account",
    `Workspace ${SECOND_ACCOUNT.slice(0, 10)}…`,
  ]) {
    if (!panelText.includes(expected)) {
      throw new Error(`account settings do not name the owning workspace (${expected}): ${JSON.stringify(panelText)}`);
    }
  }

  process.stdout.write(
    "browser account switch passed: first sign-in claimed the workspace in place, a second account reopened on its own storage, and both switches back were lossless\n",
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

async function reload(cdp, sessionId, label) {
  await cdp.send("Page.reload", { ignoreCache: false }, sessionId);
  await delay(300);
  await waitFor(cdp, sessionId, APP_BOOTED, label, 600);
}

/**
 * A switch reloads the document from inside the runtime, so the adoption
 * promise never settles in the page that started it. The marker set beforehand
 * disappears with that document, which is what proves the reload happened.
 */
async function switchAccount(cdp, sessionId, workspaceId, label) {
  await evaluate(cdp, sessionId, "window.__skriuwSwitchMarker = true");
  await cdp.send(
    "Runtime.evaluate",
    { expression: `void ${adoptExpression(workspaceId)}`, awaitPromise: false },
    sessionId,
  );
  await waitFor(cdp, sessionId, "window.__skriuwSwitchMarker === undefined", `reload onto the ${label}`, 600);
  await waitFor(cdp, sessionId, APP_BOOTED, `boot on the ${label}`, 600);
}

async function expectTitles(cdp, sessionId, { present, absent }, context) {
  const titles = await evaluate(cdp, sessionId, TREE_TITLES);
  for (const title of present) {
    if (!titles.some((candidate) => candidate.includes(title))) {
      throw new Error(`missing "${title}" ${context}: ${JSON.stringify(titles)}`);
    }
  }
  for (const title of absent) {
    if (titles.some((candidate) => candidate.includes(title))) {
      throw new Error(`"${title}" leaked ${context}: ${JSON.stringify(titles)}`);
    }
  }
}

async function openAccountSettings(cdp, sessionId) {
  await evaluate(cdp, sessionId, `(() => {
    const button = document.querySelector('button[aria-label="Settings"]');
    if (!button) throw new Error("missing the rail settings button");
    button.click();
    return true;
  })()`);
  await waitFor(cdp, sessionId, `Boolean(document.getElementById("settings-tab-account"))`, "settings dialog");
  await evaluate(cdp, sessionId, `document.getElementById("settings-tab-account").click()`);
  await waitFor(
    cdp,
    sessionId,
    `(document.getElementById("settings-tabpanel")?.innerText ?? "").includes("Notes on this device")`,
    "account section",
  );
}
