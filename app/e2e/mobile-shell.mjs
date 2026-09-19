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
const port = Number(process.env.SKRIUW_E2E_MOBILE_PORT ?? 4195);
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

/** Where the tab sits in its own history, which `history.length` cannot say once forward entries exist. */
async function historyPosition(cdp, sessionId) {
  const { currentIndex, entries } = await cdp.send("Page.getNavigationHistory", {}, sessionId);
  return { index: currentIndex, url: entries[currentIndex].url };
}

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

async function pressKey(cdp, sessionId, key, code, virtualKeyCode, text = "") {
  const common = { key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, ...(text ? { text, unmodifiedText: text } : {}) };
  await cdp.send("Input.dispatchKeyEvent", { ...common, type: "keyDown" }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { ...common, type: "keyUp" }, sessionId);
}

const MERMAID_BLOCK = `document.querySelector('pre.code-block[data-language="mermaid"]')`;

/**
 * A wide sequence diagram at phone width: the preview scrolls sideways inside
 * its block instead of widening the note, its controls are touch-sized and
 * visible without hover, and the expand sheet opens full-screen and closes
 * from its control and from Escape.
 */
async function checkMermaidPreview(cdp, sessionId) {
  await evaluate(
    cdp,
    sessionId,
    `(() => { const editor = document.querySelector('.ProseMirror[contenteditable="true"]'); editor.focus(); const selection = window.getSelection(); selection.selectAllChildren(editor); selection.collapseToEnd(); return true; })()`,
  );
  await pressKey(cdp, sessionId, "Enter", "Enter", 13);
  await pressKey(cdp, sessionId, "Enter", "Enter", 13);
  await cdp.send("Input.insertText", { text: "/sequence" }, sessionId);
  await waitFor(cdp, sessionId, `Boolean(document.querySelector('.slash-menu[role="listbox"]'))`, "sequence slash command on the compact shell");
  await pressKey(cdp, sessionId, "Enter", "Enter", 13);
  await waitFor(cdp, sessionId, `${MERMAID_BLOCK}?.dataset.mermaid === 'source'`, "mermaid fence in source mode");
  const participants = Array.from({ length: 12 }, (_, index) => `participant P${index}`).join("\n  ");
  await cdp.send("Input.insertText", { text: `${participants}\n  ` }, sessionId);
  await waitFor(cdp, sessionId, `${MERMAID_BLOCK}?.textContent.includes('participant P11')`, "twelve participants typed into the source");
  await evaluate(cdp, sessionId, `${MERMAID_BLOCK}.querySelector('.code-block-mode').click()`);
  await waitFor(cdp, sessionId, `${MERMAID_BLOCK}?.dataset.mermaid === 'preview' && Number(${MERMAID_BLOCK}.querySelector('.mermaid-preview svg')?.getAttribute('width')) > ${VIEWPORT.width}`, "rendered wide sequence preview");
  const layout = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const block = ${MERMAID_BLOCK};
      const preview = block.querySelector('.mermaid-preview');
      const svg = preview.querySelector('svg');
      const toolbar = block.querySelector('.code-block-toolbar');
      const buttons = Array.from(toolbar.querySelectorAll('button')).filter((button) => button.getBoundingClientRect().height > 0);
      return {
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
        noteOverflow: block.getBoundingClientRect().right > window.innerWidth,
        previewScrolls: preview.scrollWidth > preview.clientWidth + 8,
        wide: preview.dataset.wide,
        svgWidth: svg.getBoundingClientRect().width,
        touchAction: getComputedStyle(preview).touchAction,
        toolbarOpacity: getComputedStyle(toolbar).opacity,
        buttonHeights: buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
        buttonLabels: buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent),
      };
    })()`,
  );
  check(
    "a wide diagram scrolls inside its block without widening the page",
    !layout.pageOverflow && !layout.noteOverflow && layout.previewScrolls && layout.wide === "true" && layout.svgWidth > VIEWPORT.width,
    layout,
  );
  check(
    "the preview keeps pinch zoom and pans inside the block",
    /pinch-zoom|manipulation/.test(layout.touchAction),
    layout,
  );
  check(
    "diagram controls are visible without hover and sized for touch",
    layout.toolbarOpacity === "1" && layout.buttonHeights.every((height) => height >= 44) && layout.buttonLabels.includes("Expand diagram"),
    layout,
  );

  const expand = await evaluate(cdp, sessionId, `(() => { const rect = ${MERMAID_BLOCK}.querySelector('.code-block-expand').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  await touch(cdp, sessionId, "touchStart", [expand]);
  await touch(cdp, sessionId, "touchEnd", []);
  await waitFor(cdp, sessionId, `Boolean(document.querySelector('dialog.mermaid-expand[open] svg'))`, "expanded diagram sheet");
  const sheet = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const dialog = document.querySelector('dialog.mermaid-expand[open]');
      const canvas = dialog.querySelector('.mermaid-expand-canvas');
      const close = dialog.querySelector('.mermaid-expand-close');
      const rect = dialog.getBoundingClientRect();
      return {
        fullWidth: Math.round(rect.width) >= window.innerWidth - 1,
        fullHeight: Math.round(rect.height) >= window.innerHeight - 1,
        canvasScrolls: canvas.scrollWidth > canvas.clientWidth,
        closeHeight: Math.round(close.getBoundingClientRect().height),
        focused: document.activeElement === close,
        touchAction: getComputedStyle(canvas).touchAction,
      };
    })()`,
  );
  check(
    "expand opens the diagram full-screen with a pannable, pinchable canvas",
    sheet.fullWidth && sheet.fullHeight && sheet.canvasScrolls && sheet.closeHeight >= 44 && sheet.focused && /pinch-zoom|manipulation/.test(sheet.touchAction),
    sheet,
  );
  await pressKey(cdp, sessionId, "Escape", "Escape", 27);
  await waitFor(cdp, sessionId, `!document.querySelector('dialog.mermaid-expand')`, "expanded diagram closing from Escape");
  await touch(cdp, sessionId, "touchStart", [expand]);
  await touch(cdp, sessionId, "touchEnd", []);
  await waitFor(cdp, sessionId, `Boolean(document.querySelector('dialog.mermaid-expand[open]'))`, "expanded diagram reopened");
  const closeButton = await evaluate(cdp, sessionId, `(() => { const rect = document.querySelector('dialog.mermaid-expand .mermaid-expand-close').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`);
  await touch(cdp, sessionId, "touchStart", [closeButton]);
  await touch(cdp, sessionId, "touchEnd", []);
  await waitFor(cdp, sessionId, `!document.querySelector('dialog.mermaid-expand')`, "expanded diagram closing from its control");
  checks.push({ name: "the expanded diagram closes from Escape and from its close control", passed: true });
}

function centerOf(expression) {
  return `(() => { const node = ${expression}; if (!node) return null; const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height }; })()`;
}

const BUTTON_WITH_TEXT = (text) =>
  `Array.from(document.querySelectorAll('main[aria-label="Journal"] button')).find((button) => button.textContent.trim() === ${JSON.stringify(text)})`;
const BUTTON_LABELLED = (label) =>
  `document.querySelector('main[aria-label="Journal"] button[aria-label=${JSON.stringify(label)}]')`;

async function tap(cdp, sessionId, expression, label) {
  await waitFor(cdp, sessionId, `Boolean(${expression})`, label);
  let point = await evaluate(cdp, sessionId, centerOf(expression));
  // The editor mounting above a control moves it; aim only once it rests.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(60);
    const next = await evaluate(cdp, sessionId, centerOf(expression));
    const settled = next.x === point.x && next.y === point.y;
    point = next;
    if (settled) break;
  }
  await touch(cdp, sessionId, "touchStart", [{ x: point.x, y: point.y }]);
  await delay(40);
  await touch(cdp, sessionId, "touchEnd", []);
  return point;
}

/**
 * The journal on a phone: a day fills from a template in two taps, the choice
 * is remembered for the next empty day, an entry a week back is recalled under
 * "On this day", and days step by button and by a swipe across the heading.
 */
async function checkJournalDay(cdp, sessionId, screenshotDirectory) {
  // The tab menu before this closed from Escape and swallows ghost clicks for 350ms.
  await delay(400);
  await evaluate(cdp, sessionId, `window.location.hash = '#/journal/2026-03-09'; true`);
  await waitFor(cdp, sessionId, `Boolean(document.querySelector('[data-journal-starter]'))`, "template starter on an empty day");
  const layout = await evaluate(
    cdp,
    sessionId,
    `({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      steps: ['Previous day', 'Next day'].map((label) => document.querySelector('main[aria-label="Journal"] button[aria-label="' + label + '"]').getBoundingClientRect().height),
      moods: Array.from(document.querySelectorAll('[role="radio"]')).map((radio) => radio.getBoundingClientRect().height),
      starter: Array.from(document.querySelectorAll('[data-journal-starter] button')).map((button) => button.getBoundingClientRect().height),
    })`,
  );
  check(
    "the journal day fits the phone with touch-sized day, mood, and template controls",
    !layout.overflow && [...layout.steps, ...layout.moods, ...layout.starter].every((height) => height >= 43.5),
    layout,
  );

  await tap(cdp, sessionId, BUTTON_WITH_TEXT("Start from a template"), "template disclosure");
  await tap(cdp, sessionId, BUTTON_WITH_TEXT("Daily note"), "daily note template");
  await waitFor(
    cdp,
    sessionId,
    `!document.querySelector('[data-journal-starter]') && document.querySelector('main[aria-label="Journal"] .ProseMirror')?.textContent.includes('Monday, March 9, 2026')`,
    "template filling the entry with its own day",
  );
  checks.push({ name: "a template fills the empty entry, stamped with the entry's day", passed: true });

  await tap(cdp, sessionId, BUTTON_LABELLED("Next day"), "next day button");
  await waitFor(cdp, sessionId, `window.location.hash === '#/journal/2026-03-10'`, "next day from the button");
  await waitFor(cdp, sessionId, `Boolean(${BUTTON_WITH_TEXT("Start from Daily note")})`, "remembered template on the next empty day");
  checks.push({ name: "the next empty day offers the remembered template in one tap", passed: true });

  await evaluate(cdp, sessionId, `window.location.hash = '#/journal/2026-03-16'; true`);
  await waitFor(
    cdp,
    sessionId,
    `document.querySelector('section[aria-labelledby="journal-on-this-day"]')?.textContent.includes('A week ago')`,
    "the entry a week back under On this day",
  );
  if (screenshotDirectory) {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
    await mkdir(screenshotDirectory, { recursive: true });
    await writeFile(join(screenshotDirectory, "journal-day.png"), Buffer.from(data, "base64"));
  }
  await tap(cdp, sessionId, `document.querySelector('section[aria-labelledby="journal-on-this-day"] button')`, "recalled entry");
  await waitFor(cdp, sessionId, `window.location.hash === '#/journal/2026-03-09'`, "opening the recalled day");
  checks.push({ name: "On this day recalls the entry a week back and opens it", passed: true });

  const heading = await evaluate(cdp, sessionId, centerOf(`document.querySelector('main[aria-label="Journal"] h1')`));
  await drag(cdp, sessionId, { x: 80, y: heading.y }, { x: 260, y: heading.y + 6 });
  await waitFor(cdp, sessionId, `window.location.hash === '#/journal/2026-03-08'`, "swiping the heading right to the previous day");
  await drag(cdp, sessionId, { x: 300, y: heading.y }, { x: 300, y: heading.y + 120 });
  await delay(150);
  check(
    "a swipe across the heading steps a day; a vertical drag does not",
    (await evaluate(cdp, sessionId, `window.location.hash`)) === "#/journal/2026-03-08",
    null,
  );
}

const INSTALL_BANNER = `document.querySelector('[aria-label="Install Skriuw"]')`;

/**
 * The install strip is driven by a synthetic beforeinstallprompt, the same
 * event Chromium fires once per load when the app is installable; nothing in
 * the harness can be installed for real, so the run stops at the offer.
 */
async function checkInstallBanner(cdp, sessionId) {
  check("no install strip before the browser offers", (await evaluate(cdp, sessionId, `${INSTALL_BANNER} === null`)) === true, null);
  await evaluate(
    cdp,
    sessionId,
    `(() => { const event = new Event("beforeinstallprompt", { cancelable: true }); event.prompt = () => Promise.resolve(); event.userChoice = Promise.resolve({ outcome: "dismissed" }); window.dispatchEvent(event); return event.defaultPrevented; })()`,
  );
  await waitFor(cdp, sessionId, `${INSTALL_BANNER} !== null`, "install strip");
  const screenshotDirectory = process.env.SKRIUW_E2E_SCREENSHOTS ?? null;
  if (screenshotDirectory) {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }, sessionId);
    await mkdir(screenshotDirectory, { recursive: true });
    await writeFile(join(screenshotDirectory, "install-strip.png"), Buffer.from(data, "base64"));
  }
  const geometry = await evaluate(
    cdp,
    sessionId,
    `(() => { const strip = ${INSTALL_BANNER}.getBoundingClientRect(); const tabs = document.querySelector('.shell-tab-bar').getBoundingClientRect(); const close = document.querySelector('[aria-label="Install Skriuw"] [aria-label="Not now"]').getBoundingClientRect(); return { stripBottom: strip.bottom, tabsTop: tabs.top, stripHeight: strip.height, closeHeight: close.height, overflow: document.documentElement.scrollWidth > window.innerWidth }; })()`,
  );
  check(
    "the install strip sits directly above the tab bar at a touch size",
    Math.abs(geometry.stripBottom - geometry.tabsTop) <= 1 && geometry.stripHeight >= 44 && geometry.closeHeight >= 40 && !geometry.overflow,
    geometry,
  );
  await evaluate(cdp, sessionId, `document.querySelector('[aria-label="Install Skriuw"] [aria-label="Not now"]').click(); true`);
  await waitFor(cdp, sessionId, `${INSTALL_BANNER} === null`, "install strip dismissed");
  await cdp.send("Page.reload", {}, sessionId);
  await waitFor(cdp, sessionId, `Boolean(document.querySelector('.shell-tab-bar'))`, "compact shell after reload", 600);
  await evaluate(
    cdp,
    sessionId,
    `window.__consoleErrors = []; const original = console.error; console.error = (...args) => { window.__consoleErrors.push(args.map(String).join(' ')); original(...args); }; (() => { const event = new Event("beforeinstallprompt", { cancelable: true }); event.prompt = () => Promise.resolve(); event.userChoice = Promise.resolve({ outcome: "dismissed" }); window.dispatchEvent(event); })(); true`,
  );
  await delay(150);
  check("a dismissed install strip stays away after a reload", (await evaluate(cdp, sessionId, `${INSTALL_BANNER} === null`)) === true, null);
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
  const edges = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const hit = (label, dx) => {
        const button = document.querySelector('button[aria-label="' + label + '"]');
        const rect = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(rect.left + dx, rect.top + rect.height / 2));
      };
      const tab = document.querySelector('.shell-tab');
      const tabRect = tab.getBoundingClientRect();
      return {
        toggleLeftEdge: hit('Toggle sidebar', 4),
        metadataRightEdge: (() => { const b = document.querySelector('button[aria-label="Toggle metadata"]'); const r = b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.right - 4, r.top + r.height / 2)); })(),
        firstTabLeftEdge: tab.contains(document.elementFromPoint(tabRect.left + 4, tabRect.top + tabRect.height / 2)),
        stripAtEditorEdge: Boolean(document.elementFromPoint(6, window.innerHeight / 2)?.closest('.shell-edge-left')),
      };
    })()`,
  );
  check(
    "edge swipe strips never cover toolbar or tab bar controls",
    edges.toggleLeftEdge && edges.metadataRightEdge && edges.firstTabLeftEdge && edges.stripAtEditorEdge,
    edges,
  );

  const toolbarTargets = await evaluate(
    cdp,
    sessionId,
    `Array.from(document.querySelectorAll('main button[aria-label]')).map((b) => [b.getAttribute('aria-label'), b.getBoundingClientRect().height])`,
  );
  check("compact toolbar buttons grow to a 44px touch target", toolbarTargets.every(([, height]) => height >= 44), { toolbarTargets });

  await tap(cdp, sessionId, `document.querySelector('main button[aria-label="Search"]')`, "search button");
  await waitFor(cdp, sessionId, `document.querySelector('dialog.command-palette')?.open === true`, "palette from the toolbar");
  const palette = await evaluate(
    cdp,
    sessionId,
    `(() => { const rect = document.querySelector('dialog.command-palette').getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight }; })()`,
  );
  check("the search button opens the palette inside the viewport", palette.top >= 0 && palette.bottom <= palette.viewport, palette);
  await pressKey(cdp, sessionId, "Escape", "Escape", 27);
  await waitFor(cdp, sessionId, `!document.querySelector('dialog.command-palette')?.open`, "palette closing");
  await delay(400);

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

  await checkMermaidPreview(cdp, sessionId);

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

  // The platform back gesture is history.back(): it must close the overlay
  // on top and leave the route alone, and closing any other way must not
  // leave an entry behind for the next back press to land on.
  const positionBefore = await historyPosition(cdp, sessionId);
  await evaluate(cdp, sessionId, pressLabelled("Toggle sidebar"));
  await waitForSheet(cdp, sessionId, "left", "tree sheet for the back gesture");
  const positionOpen = await historyPosition(cdp, sessionId);
  await evaluate(cdp, sessionId, `history.back(); true`);
  await waitFor(cdp, sessionId, NO_SHEET, "sheet closing from the back gesture");
  const positionAfterBack = await historyPosition(cdp, sessionId);
  check(
    "the back gesture closes an open sheet and keeps the route",
    positionOpen.index === positionBefore.index + 1 &&
      positionAfterBack.index === positionBefore.index &&
      positionAfterBack.url.endsWith("#/notes"),
    { positionBefore, positionOpen, positionAfterBack },
  );
  await evaluate(cdp, sessionId, pressLabelled("Toggle sidebar"));
  await waitForSheet(cdp, sessionId, "left", "tree sheet for a close control");
  await evaluate(cdp, sessionId, pressLabelled("Close Notes"));
  await waitFor(cdp, sessionId, NO_SHEET, "sheet closing from its header");
  await waitFor(cdp, sessionId, `history.state === null`, "overlay entry popping after a manual close");
  const positionAfterClose = await historyPosition(cdp, sessionId);
  check(
    "closing a sheet by hand pops its history entry",
    positionAfterClose.index === positionBefore.index && positionAfterClose.url.endsWith("#/notes"),
    { positionBefore, positionAfterClose },
  );

  const journalTab = await evaluate(
    cdp,
    sessionId,
    `(() => { const rect = document.querySelector('.shell-tab[aria-label="Journal"]').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
  );
  const positionBeforeTab = await historyPosition(cdp, sessionId);
  await touch(cdp, sessionId, "touchStart", [journalTab]);
  await touch(cdp, sessionId, "touchEnd", []);
  await waitFor(cdp, sessionId, `location.hash === "#/journal" && document.querySelector('.shell-tab[aria-label="Journal"][aria-current="page"]') !== null`, "journal tab");
  const positionAfterTab = await historyPosition(cdp, sessionId);
  check(
    "a tab bar tap replaces the history entry instead of pushing one",
    positionAfterTab.index === positionBeforeTab.index && positionAfterTab.url.endsWith("#/journal"),
    { positionBeforeTab, positionAfterTab },
  );
  await evaluate(cdp, sessionId, `location.hash = "#/notes"; true`);
  await waitFor(cdp, sessionId, `location.hash === "#/notes"`, "notes route");
  await waitFor(cdp, sessionId, NO_SHEET, "no sheet after returning to notes");

  await evaluate(cdp, sessionId, pressLabelled("Settings"));
  await waitFor(cdp, sessionId, `Boolean(document.querySelector('dialog[open]'))`, "settings dialog");
  const settings = await evaluate(
    cdp,
    sessionId,
    `(() => { const rect = document.querySelector('dialog[open]').getBoundingClientRect(); return { width: rect.width, height: rect.height, top: rect.top, viewport: window.innerHeight }; })()`,
  );
  check(
    "settings fills the phone edge to edge",
    settings.width === VIEWPORT.width && settings.top === 0 && Math.abs(settings.height - settings.viewport) <= 1,
    settings,
  );
  await evaluate(cdp, sessionId, `history.back(); true`);
  await waitFor(cdp, sessionId, `!document.querySelector('dialog[open]')`, "settings closing from the back gesture");
  checks.push({ name: "the back gesture closes the settings dialog", passed: true });

  // The native close event lands a task after the element closes, so the
  // trigger reports the settled state before it is pressed again.
  await waitFor(cdp, sessionId, `document.querySelector('button[aria-label="Settings"]').getAttribute('aria-expanded') === 'false'`, "settings trigger settling");
  await evaluate(cdp, sessionId, pressLabelled("Settings"));
  await waitFor(cdp, sessionId, `Boolean(document.querySelector('dialog[open] .dialog-grabber'))`, "settings grabber");
  const grabber = await evaluate(
    cdp,
    sessionId,
    `(() => { const rect = document.querySelector('dialog[open] .dialog-grabber').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, height: rect.height }; })()`,
  );
  check("a phone dialog shows a grabber to pull", grabber.height >= 20, grabber);
  await drag(cdp, sessionId, { x: grabber.x, y: grabber.y }, { x: grabber.x + 2, y: grabber.y + 40 }, { steps: 8 });
  await delay(250);
  const dialogStillOpen = await evaluate(cdp, sessionId, `Boolean(document.querySelector('dialog[open]'))`);
  check("a short pull settles the dialog back", dialogStillOpen, { dialogStillOpen });
  await drag(cdp, sessionId, { x: grabber.x, y: grabber.y }, { x: grabber.x + 2, y: grabber.y + 160 }, { steps: 12 });
  await waitFor(cdp, sessionId, `!document.querySelector('dialog[open]')`, "settings closing from a pull");
  checks.push({ name: "pulling the grabber down closes the dialog", passed: true });

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

  await hold(cdp, sessionId, gamma, 650);
  await waitFor(cdp, sessionId, `document.querySelectorAll('[role="menuitem"]').length > 0`, "menu for rename");
  const renameItem = await evaluate(
    cdp,
    sessionId,
    `(() => { const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((m) => m.textContent.startsWith('Rename')); const rect = item.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
  );
  // A real tap, so the click the browser synthesises after the menu unmounts
  // is part of the scenario: it must not reach the row underneath.
  await touch(cdp, sessionId, "touchStart", [renameItem]);
  await touch(cdp, sessionId, "touchEnd", []);
  await waitFor(cdp, sessionId, `Boolean(document.querySelector('input[aria-label^="Rename"]'))`, "inline rename field");
  await delay(400);
  const rename = await evaluate(
    cdp,
    sessionId,
    `(() => { const input = document.querySelector('input[aria-label^="Rename"]'); return { font: parseFloat(getComputedStyle(input).fontSize), focused: document.activeElement === input, sheetOpen: ${SHEET_OPEN("left")} }; })()`,
  );
  check(
    "hold then Rename focuses an inline field the tap underneath cannot disturb",
    rename.font >= 16 && rename.focused && rename.sheetOpen,
    rename,
  );
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor(cdp, sessionId, `!document.querySelector('input[aria-label^="Rename"]')`, "rename field closing");

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
  const toastPlacement = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const undo = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Undo');
      const rect = undo.getBoundingClientRect();
      const tabBar = document.querySelector('.shell-tab-bar').getBoundingClientRect();
      return { undoBottom: rect.bottom, tabBarTop: tabBar.top, undoHeight: rect.height };
    })()`,
  );
  check("the undo toast sits above the tab bar", toastPlacement.undoBottom <= toastPlacement.tabBarTop, toastPlacement);
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

  await hold(cdp, sessionId, await evaluate(cdp, sessionId, rowCenter("Gamma note")), 650);
  await waitFor(cdp, sessionId, `document.querySelectorAll('[role="menuitem"]').length > 0`, "menu for open in tab");
  const openInTab = await evaluate(
    cdp,
    sessionId,
    `(() => { const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((m) => m.textContent.startsWith('Open in new tab')); const rect = item.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
  );
  await touch(cdp, sessionId, "touchStart", [openInTab]);
  await touch(cdp, sessionId, "touchEnd", []);
  await waitFor(cdp, sessionId, NO_SHEET, "sheet closing after opening a tab");
  await waitFor(cdp, sessionId, `document.querySelectorAll('[role="tab"]').length === 2`, "two note tabs");
  const tab = await evaluate(
    cdp,
    sessionId,
    `(() => { const rect = document.querySelector('[role="tab"]').getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, height: rect.height }; })()`,
  );
  await hold(cdp, sessionId, tab, 650);
  await waitFor(cdp, sessionId, `document.querySelectorAll('[role="menuitem"]').length > 0`, "tab menu from a hold");
  const tabMenu = await evaluate(
    cdp,
    sessionId,
    `Array.from(document.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent.trim())`,
  );
  check("a held note tab opens the tab menu at a touch size", tab.height >= 43.5 && tabMenu.includes("Close all but this"), { tab, tabMenu });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);

  await checkJournalDay(cdp, sessionId, process.env.SKRIUW_E2E_SCREENSHOTS ?? null);
  await checkInstallBanner(cdp, sessionId);

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
