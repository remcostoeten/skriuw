import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import {
  connectCdp,
  delay,
  evaluate,
  launchChrome,
  stopProcess,
  waitFor,
  waitForServer,
} from "../../../e2e/chrome-harness.mjs";

/**
 * Proves the standalone editor bundle against the host protocol in a phone
 * sized, touch-emulated Chrome: the page is driven only through protocol
 * messages from `host.ts`, the way the native webview host will drive it.
 */

const harnessDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = resolve(harnessDirectory, "../..");
const viteConfig = join(harnessDirectory, "vite.config.ts");
const distDirectory = join(harnessDirectory, "dist");
const port = Number(process.env.SKRIUW_EDITOR_HOST_PORT ?? 4197);
const baseUrl = `http://127.0.0.1:${port}`;
const hostUrl = `${baseUrl}/harnesses/editor-host/host.html`;
const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  harnessDirectory,
  outputIndex >= 0
    ? (process.argv[outputIndex + 1] ?? "results/latest.json")
    : "results/latest.json",
);
const VIEWPORT = { width: 390, height: 844 };
const ALTERNATING_LOADS = 200;
const HEAP_GROWTH_LIMIT_BYTES = 24 * 1024 * 1024;
const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-editor-host-"));
const checks = [];
let server;
let browser;
let socket;

const EDITOR_DOCUMENT = `document.querySelector('#editor').contentDocument`;
const PROSEMIRROR = `${EDITOR_DOCUMENT}.querySelector('.ProseMirror[contenteditable="true"]')`;
const HOST = `window.__EDITOR_HOST__`;

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${JSON.stringify(detail)}`);
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: appDirectory, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (chunk) => (log += String(chunk)));
    child.stderr.on("data", (chunk) => (log += String(chunk)));
    child.on("error", rejectRun);
    child.on("exit", (code) =>
      code === 0 ? resolveRun(log) : rejectRun(new Error(`${command} exited ${code}\n${log}`)),
    );
  });
}

async function bundleSizes() {
  const assets = join(distDirectory, "assets");
  const files = [];
  for (const name of await readdir(assets)) {
    const path = join(assets, name);
    const bytes = (await stat(path)).size;
    files.push({ name, bytes, gzipBytes: gzipSync(readFileSync(path)).length });
  }
  files.sort((left, right) => right.bytes - left.bytes);
  return files;
}

async function touch(cdp, sessionId, type, touchPoints) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints }, sessionId);
}

async function tap(cdp, sessionId, point) {
  await touch(cdp, sessionId, "touchStart", [point]);
  await delay(40);
  await touch(cdp, sessionId, "touchEnd", []);
}

async function pressEnter(cdp, sessionId) {
  const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await cdp.send("Input.dispatchKeyEvent", { ...key, type: "keyDown", text: "\r" }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { ...key, type: "keyUp" }, sessionId);
}

function rectOf(selector) {
  return `(() => {
    const element = ${EDITOR_DOCUMENT}.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`;
}

function insideViewport(rect) {
  return (
    rect !== null &&
    rect.left >= 0 &&
    rect.right <= VIEWPORT.width &&
    rect.top >= 0 &&
    rect.bottom <= VIEWPORT.height
  );
}

async function loadNote(cdp, sessionId, noteId, expectedText) {
  await evaluate(cdp, sessionId, `${HOST}.load(${JSON.stringify(noteId)})`);
  await waitFor(
    cdp,
    sessionId,
    `${PROSEMIRROR}?.textContent.includes(${JSON.stringify(expectedText)}) === true`,
    `${noteId} on screen`,
  );
}

async function caretToEnd(cdp, sessionId) {
  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const editor = ${PROSEMIRROR};
      editor.focus();
      const selection = editor.ownerDocument.getSelection();
      selection.selectAllChildren(editor);
      selection.collapseToEnd();
      return true;
    })()`,
  );
}

function changesFor(noteId) {
  return `${HOST}.messages.filter((message) => message.type === 'change' && message.noteId === ${JSON.stringify(noteId)}).map((message) => ({ changeId: message.changeId, revision: message.revision, v: message.v }))`;
}

async function heapUsed(cdp, sessionId) {
  await cdp.send("HeapProfiler.collectGarbage", {}, sessionId);
  const { usedSize } = await cdp.send("Runtime.getHeapUsage", {}, sessionId);
  return usedSize;
}

try {
  await run("bun", ["x", "vite", "build", "--config", viteConfig]);
  const bundle = await bundleSizes();
  server = spawn("bun", ["x", "vite", "preview", "--config", viteConfig, "--port", String(port)], {
    cwd: appDirectory,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(server, hostUrl);

  const launched = await launchChrome(profileDirectory);
  browser = launched.child;
  const cdp = await connectCdp(launched.webSocketUrl);
  socket = cdp;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("HeapProfiler.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { ...VIEWPORT, deviceScaleFactor: 3, mobile: true },
    sessionId,
  );
  await cdp.send(
    "Emulation.setTouchEmulationEnabled",
    { enabled: true, maxTouchPoints: 5 },
    sessionId,
  );
  await cdp.send("Page.navigate", { url: hostUrl }, sessionId);
  await waitFor(
    cdp,
    sessionId,
    `${HOST}?.messages.some((message) => message.type === 'ready') === true`,
    "ready message",
  );
  const ready = await evaluate(cdp, sessionId, `${HOST}.messages[0]`);
  check("first message is a versioned ready", ready.type === "ready" && ready.v === 1, ready);

  await loadNote(cdp, sessionId, "note-1", "Body of note 1.");
  await delay(300);
  const requests = await evaluate(
    cdp,
    sessionId,
    `[...performance.getEntriesByType('resource'), ...document.querySelector('#editor').contentWindow.performance.getEntriesByType('resource')].map((entry) => ({ url: entry.name, type: entry.initiatorType }))`,
  );
  const offOrigin = requests.filter(({ url }) => !url.startsWith(baseUrl));
  const dataRequests = requests.filter(
    ({ type }) => type === "fetch" || type === "xmlhttprequest" || type === "beacon",
  );
  check(
    "load makes no network request beyond the bundle",
    offOrigin.length === 0 && dataRequests.length === 0,
    {
      offOrigin,
      dataRequests,
    },
  );

  await evaluate(cdp, sessionId, `(${PROSEMIRROR}.dataset.harnessView = 'original', true)`);
  await caretToEnd(cdp, sessionId);
  await cdp.send("Input.insertText", { text: " first-edit" }, sessionId);
  await waitFor(
    cdp,
    sessionId,
    `${changesFor("note-1")}.length === 1`,
    "debounced change for note-1",
  );
  await caretToEnd(cdp, sessionId);
  await cdp.send("Input.insertText", { text: " second-edit" }, sessionId);
  await loadNote(cdp, sessionId, "note-2", "Body of note 2.");
  await waitFor(
    cdp,
    sessionId,
    `${changesFor("note-1")}.length === 2`,
    "change flushed by the note switch",
  );
  await loadNote(cdp, sessionId, "note-1", "first-edit second-edit");
  const changes = await evaluate(cdp, sessionId, changesFor("note-1"));
  check(
    "changes are ordered and each builds on the acknowledged revision",
    changes.length === 2 &&
      changes[0].changeId < changes[1].changeId &&
      changes[0].revision === 1 &&
      changes[1].revision === 2 &&
      changes.every((change) => change.v === 1),
    changes,
  );
  const durable = await evaluate(cdp, sessionId, `${HOST}.note('note-1')`);
  check(
    "the host holds both edits durably",
    durable.revision === 3 && durable.markdown.includes("first-edit second-edit"),
    { revision: durable.revision, markdown: durable.markdown },
  );

  const elementsBefore = await evaluate(
    cdp,
    sessionId,
    `${EDITOR_DOCUMENT}.querySelectorAll('*').length`,
  );
  const heapBefore = await heapUsed(cdp, sessionId);
  for (let index = 0; index < ALTERNATING_LOADS; index += 1) {
    const second = index % 2 === 0;
    await loadNote(
      cdp,
      sessionId,
      second ? "note-2" : "note-1",
      second ? "Body of note 2." : "first-edit second-edit",
    );
  }
  const heapAfter = await heapUsed(cdp, sessionId);
  const views = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const editors = ${EDITOR_DOCUMENT}.querySelectorAll('.ProseMirror');
      return { count: editors.length, original: editors[0]?.dataset.harnessView === 'original', elements: ${EDITOR_DOCUMENT}.querySelectorAll('*').length };
    })()`,
  );
  check(
    `${ALTERNATING_LOADS} alternating loads keep the one original view`,
    views.count === 1 && views.original && views.elements <= elementsBefore + 8,
    { ...views, elementsBefore },
  );
  check(
    "alternating loads do not grow the heap",
    heapAfter - heapBefore < HEAP_GROWTH_LIMIT_BYTES,
    {
      heapBefore,
      heapAfter,
    },
  );
  const spuriousChanges = await evaluate(
    cdp,
    sessionId,
    `${HOST}.messages.filter((message) => message.type === 'change').length`,
  );
  check("loads alone emit no change", spuriousChanges === 2, { changes: spuriousChanges });

  await evaluate(cdp, sessionId, `${HOST}.setTheme('paper')`);
  await waitFor(
    cdp,
    sessionId,
    `${EDITOR_DOCUMENT}.documentElement.dataset.theme === 'paper'`,
    "theme message applied",
  );
  check(
    "theme swaps without reloading the view",
    await evaluate(cdp, sessionId, `${PROSEMIRROR}.dataset.harnessView === 'original'`),
    {},
  );

  await evaluate(
    cdp,
    sessionId,
    `${HOST}.send({ type: 'remote-change', changeSet: { documents: [{ ...${HOST}.note('note-1'), revision: 9, markdown: '# Note 1\\n\\nRemote body.\\n', document: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Note 1' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Remote body.' }] }] } }] } })`,
  );
  await waitFor(
    cdp,
    sessionId,
    `${PROSEMIRROR}.textContent.includes('Remote body.')`,
    "remote change on screen",
  );

  const paragraph = await evaluate(cdp, sessionId, rectOf(".ProseMirror p"));
  await tap(cdp, sessionId, { x: paragraph.right - 4, y: paragraph.y });
  await caretToEnd(cdp, sessionId);
  await pressEnter(cdp, sessionId);
  await cdp.send("Input.insertText", { text: "/" }, sessionId);
  await waitFor(
    cdp,
    sessionId,
    `Boolean(${EDITOR_DOCUMENT}.querySelector('.slash-menu [role="option"]'))`,
    "slash menu under touch",
  );
  const slashRect = await evaluate(cdp, sessionId, rectOf(".slash-menu"));
  check("slash menu fits the 390px viewport", insideViewport(slashRect), slashRect);
  await cdp.send("Input.insertText", { text: "quote" }, sessionId);
  await waitFor(
    cdp,
    sessionId,
    `${EDITOR_DOCUMENT}.querySelectorAll('.slash-menu [role="option"]').length >= 1`,
    "filtered slash items",
  );
  const option = await evaluate(cdp, sessionId, rectOf('.slash-menu [role="option"]'));
  await tap(cdp, sessionId, { x: option.x, y: option.y });
  await waitFor(
    cdp,
    sessionId,
    `!${EDITOR_DOCUMENT}.querySelector('.slash-menu') && Boolean(${PROSEMIRROR}.querySelector('blockquote'))`,
    "slash command applied by tap",
  );

  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const editor = ${PROSEMIRROR};
      const text = editor.querySelector('p').firstChild;
      const selection = editor.ownerDocument.getSelection();
      const range = editor.ownerDocument.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 6);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    })()`,
  );
  await waitFor(
    cdp,
    sessionId,
    `Boolean(${EDITOR_DOCUMENT}.querySelector('.bubble-menu[role="toolbar"]'))`,
    "bubble menu for a touch selection",
  );
  const bubbleRect = await evaluate(cdp, sessionId, rectOf(".bubble-menu"));
  check("bubble menu fits the 390px viewport", insideViewport(bubbleRect), bubbleRect);
  const bold = await evaluate(cdp, sessionId, rectOf('.bubble-menu button[aria-label="Bold"]'));
  check("bubble menu offers Bold at phone width", bold !== null, bold);
  await tap(cdp, sessionId, { x: bold.x, y: bold.y });
  await waitFor(
    cdp,
    sessionId,
    `${PROSEMIRROR}.querySelector('p strong')?.textContent === 'Remote'`,
    "bold applied by tap",
  );

  await evaluate(cdp, sessionId, `${HOST}.sendRaw({ v: 99, type: 'load' })`);
  await waitFor(
    cdp,
    sessionId,
    `${HOST}.messages.some((message) => message.type === 'failure' && message.code === 'protocol-version')`,
    "version mismatch failure",
  );

  const runtimeFailures = await evaluate(
    cdp,
    sessionId,
    `${HOST}.messages.filter((message) => message.type === 'failure' && message.code === 'runtime-error')`,
  );
  check("the editor reported no runtime error", runtimeFailures.length === 0, runtimeFailures);

  const result = {
    viewport: VIEWPORT,
    bundle,
    bundleTotalBytes: bundle.reduce((total, file) => total + file.bytes, 0),
    bundleTotalGzipBytes: bundle.reduce((total, file) => total + file.gzipBytes, 0),
    requestsOnLoad: requests.length,
    heapBefore,
    heapAfter,
    checks,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  for (const { name } of checks) console.log(`ok - ${name}`);
  console.log(
    `bundle ${result.bundleTotalBytes} bytes (${result.bundleTotalGzipBytes} gzip) → ${output}`,
  );
} finally {
  socket?.close();
  await stopProcess(browser, "SIGTERM");
  await stopProcess(server, "SIGTERM");
  await rm(profileDirectory, { recursive: true, force: true });
}
