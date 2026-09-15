import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
 * Drives the compact shell the way a phone does: a 390px viewport with touch
 * emulation, against the hermetic workflow harness (`bridge-mock.ts`, no
 * storage worker). Proves the layout never overflows, both side panels open as
 * sheets and close every way a thumb expects, and the tree's touch gestures
 * (hold for the menu, pull left to delete with undo) reach the store.
 */

const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 4195;
const baseUrl = `http://127.0.0.1:${port}`;
const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  appDirectory,
  outputIndex >= 0 ? (process.argv[outputIndex + 1] ?? "e2e/results/mobile-latest.json") : "e2e/results/mobile-latest.json",
);
const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-mobile-shell-"));
const VIEWPORT = { width: 390, height: 844 };
let server;
let browser;
let socket;

const SHEET_OPEN = (side) =>
  `Boolean(document.querySelector('.mobile-sheet-root[data-state="open"][data-side="${side}"]'))`;
const NO_SHEET = `!document.querySelector('.mobile-sheet-root[data-state="open"]')`;
// The panel slides in over 260ms; a touch aimed at a row before it settles
// lands beside the viewport.
const SHEET_SETTLED = `(() => {
  const panel = document.querySelector('.mobile-sheet-root[data-state="open"] .mobile-sheet-panel');
  if (!panel) return false;
  const rect = panel.getBoundingClientRect();
  return rect.left >= 0 && rect.right <= window.innerWidth;
})()`;

async function waitForSheet(cdp, sessionId, side, label) {
  await waitFor(cdp, sessionId, SHEET_OPEN(side), label);
  await waitFor(cdp, sessionId, SHEET_SETTLED, `${label} settling`);
}
const IGNORED_CONSOLE = /navigator\.vibrate/;

function pressLabelled(label) {
  return `(() => {
    const button = Array.from(document.querySelectorAll('button[aria-label]'))
      .find((candidate) => candidate.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!button) throw new Error("missing button: " + ${JSON.stringify(label)});
    button.click();
    return true;
  })()`;
}

function rowCenter(title) {
  return `(() => {
    const row = Array.from(document.querySelectorAll('[role="treeitem"]'))
      .find((candidate) => candidate.textContent.includes(${JSON.stringify(title)}));
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    return { x: rect.left + 80, y: rect.top + rect.height / 2 };
  })()`;
}

async function touch(cdp, sessionId, type, points) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points }, sessionId);
}

async function drag(cdp, sessionId, from, to, options = {}) {
  const steps = options.steps ?? 12;
  await touch(cdp, sessionId, "touchStart", [from]);
  if (options.holdMs) await delay(options.holdMs);
  for (let step = 1; step <= steps; step += 1) {
    const x = from.x + ((to.x - from.x) * step) / steps;
    const y = from.y + ((to.y - from.y) * step) / steps;
    await touch(cdp, sessionId, "touchMove", [{ x, y }]);
    await delay(16);
  }
  await touch(cdp, sessionId, "touchEnd", []);
}

async function hold(cdp, sessionId, point, milliseconds) {
  await touch(cdp, sessionId, "touchStart", [point]);
  await delay(milliseconds);
  await touch(cdp, sessionId, "touchEnd", []);
}

const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${JSON.stringify(detail)}`);
}

const consoleErrors = [];

try {
  server = startViteServer(appDirectory, port, ["--config", "e2e/vite.config.ts"]);
  await waitForServer(server, `${baseUrl}/e2e/index.html`);
  const launched = await launchChrome(profileDirectory);
  browser = launched.child;
  socket = await connectCdp(launched.webSocketUrl);
  const cdp = socket;
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { ...VIEWPORT, deviceScaleFactor: 2, mobile: true },
    sessionId,
  );
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
  await cdp.send("Page.navigate", { url: `${baseUrl}/e2e/index.html#/notes` }, sessionId);
  await waitFor(cdp, sessionId, `Boolean(document.querySelector('.shell-tab-bar'))`, "compact shell", 600);
  await evaluate(
    cdp,
    sessionId,
    `window.__consoleErrors = []; const original = console.error; console.error = (...args) => { window.__consoleErrors.push(args.map(String).join(' ')); original(...args); }; true`,
  );

  const layout = await evaluate(
    cdp,
    sessionId,
    `({
      tabs: document.querySelectorAll('.shell-tab').length,
      rail: Boolean(document.querySelector('nav[aria-label="Primary"].flex')),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      coarse: matchMedia('(pointer: coarse)').matches,
      toolbar: Array.from(document.querySelectorAll('main button[aria-label]')).map((b) => b.getAttribute('aria-label')),
    })`,
  );
  check("compact layout replaces the rail with a tab bar", layout.tabs === 7 && !layout.rail && !layout.overflow, layout);
  check("touch emulation reports a coarse pointer", layout.coarse, layout);
  check("compact toolbar drops the prev/next note pair", !layout.toolbar.includes("Previous note"), layout);

  await evaluate(cdp, sessionId, pressLabelled("Toggle sidebar"));
  await waitForSheet(cdp, sessionId, "left", "tree sheet from the toolbar");
  const rowHeight = await evaluate(cdp, sessionId, `document.querySelector('[role="treeitem"]').getBoundingClientRect().height`);
  check("tree rows grow to a 44px touch target", rowHeight >= 44, { rowHeight });
  const inert = await evaluate(cdp, sessionId, `document.querySelector('.shell-compact').hasAttribute('inert')`);
  check("the page behind an open sheet is inert", inert, { inert });

  const beta = await evaluate(cdp, sessionId, rowCenter("Beta note"));
  await touch(cdp, sessionId, "touchStart", [beta]);
  await touch(cdp, sessionId, "touchEnd", []);
  await waitFor(cdp, sessionId, NO_SHEET, "sheet closing after a note tap");
  const crumbs = await evaluate(cdp, sessionId, `document.querySelector('main').textContent`);
  check("tapping a note activates it and dismisses the sheet", crumbs.includes("Beta note"), { crumbs: crumbs.slice(0, 80) });

  await drag(cdp, sessionId, { x: 4, y: 300 }, { x: 140, y: 304 });
  await waitForSheet(cdp, sessionId, "left", "tree sheet from an edge swipe");
  await drag(cdp, sessionId, { x: 250, y: 20 }, { x: 60, y: 22 });
  await waitFor(cdp, sessionId, NO_SHEET, "sheet closing from a pull toward its edge");
  checks.push({ name: "edge swipe opens the tree and a pull closes it", passed: true });

  await evaluate(cdp, sessionId, pressLabelled("Toggle metadata"));
  await waitForSheet(cdp, sessionId, "right", "inspector sheet");
  await evaluate(cdp, sessionId, pressLabelled("Close Note details"));
  await waitFor(cdp, sessionId, NO_SHEET, "inspector sheet closing from its header");
  checks.push({ name: "the inspector opens as a right sheet with a close control", passed: true });

  await evaluate(cdp, sessionId, pressLabelled("Toggle sidebar"));
  await waitForSheet(cdp, sessionId, "left", "tree sheet for gestures");
  const gamma = await evaluate(cdp, sessionId, rowCenter("Gamma note"));
  await hold(cdp, sessionId, gamma, 650);
  await waitFor(cdp, sessionId, `document.querySelectorAll('[role="menuitem"]').length > 0`, "long-press menu");
  const menu = await evaluate(
    cdp,
    sessionId,
    `Array.from(document.querySelectorAll('[role="menuitem"]')).map((item) => ({ label: item.textContent.trim().slice(0, 12), height: item.getBoundingClientRect().height }))`,
  );
  check(
    "a held row opens the item menu with touch-sized rows",
    menu.some((item) => item.label.startsWith("Rename")) && menu.some((item) => item.label.startsWith("Delete")) && menu.every((item) => item.height >= 43.5),
    menu,
  );
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor(cdp, sessionId, `document.querySelectorAll('[role="menuitem"]').length === 0`, "menu closing");
  const stillOpen = await evaluate(cdp, sessionId, SHEET_OPEN("left"));
  check("Escape in the menu closes the menu, not the sheet", stillOpen, { stillOpen });

  const root = await evaluate(cdp, sessionId, rowCenter("Root note"));
  await drag(cdp, sessionId, { x: root.x + 120, y: root.y }, { x: root.x - 10, y: root.y + 2 }, { steps: 14 });
  await waitFor(
    cdp,
    sessionId,
    `!Array.from(document.querySelectorAll('[role="treeitem"]')).some((row) => row.textContent.includes('Root note'))`,
    "row leaving the tree after a swipe",
  );
  const toast = await evaluate(
    cdp,
    sessionId,
    `Array.from(document.querySelectorAll('[role="status"], [role="alert"]')).map((node) => node.textContent).join(' | ')`,
  );
  check("a pull past the threshold trashes the row and offers undo", /Moved .*Root note.* to trash/.test(toast) && /Undo/.test(toast), { toast });
  await evaluate(
    cdp,
    sessionId,
    `(() => { const undo = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Undo'); if (!undo) throw new Error('missing undo'); undo.click(); return true; })()`,
  );
  await waitFor(
    cdp,
    sessionId,
    `Array.from(document.querySelectorAll('[role="treeitem"]')).some((row) => row.textContent.includes('Root note'))`,
    "row returning after undo",
  );
  checks.push({ name: "undo restores the swiped row", passed: true });

  const errors = await evaluate(cdp, sessionId, `window.__consoleErrors`);
  consoleErrors.push(...errors.filter((line) => !IGNORED_CONSOLE.test(line)));
  check("the scenario logs no console errors", consoleErrors.length === 0, consoleErrors);

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ ok: true, viewport: VIEWPORT, checks }, null, 2)}\n`);
  console.log(`mobile shell: ${checks.length} checks passed`);
} catch (error) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ ok: false, checks, error: String(error) }, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
} finally {
  socket?.close();
  await stopProcess(browser, "SIGKILL");
  await stopProcess(server, "SIGTERM");
  await rm(profileDirectory, { recursive: true, force: true });
}
