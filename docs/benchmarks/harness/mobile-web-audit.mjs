/**
 * Drives the mobile shell's React Native Web export at phone size and reports
 * two things: how long the shell takes to become operable from a cold load
 * (`docs/specs/mobile-app.md`, R-P4) and the accessible role, name and touch
 * target of every control on every route and overlay (R-Q2).
 *
 * ```bash
 * mobile/node_modules/.bin/expo export --platform web \
 *   --output-dir /tmp/skriuw-mobile-web --clear   # needs web.bundler=metro
 * node docs/benchmarks/harness/mobile-web-audit.mjs --dir /tmp/skriuw-mobile-web
 * ```
 *
 * React Native Web is not React Native: this measures the shared shell logic,
 * the accessibility props it sets and the sizes it computes, in a browser
 * engine. It is not a device verdict, and it exercises no native view,
 * VoiceOver or TalkBack. See `docs/benchmarks/harness/README.md`.
 */

import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  connectCdp,
  delay,
  evaluate,
  launchChrome,
  stopProcess,
  waitFor,
} from "../../../apps/workspace/e2e/chrome-harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const exportDirectory = resolve(argument("dir", "/tmp/skriuw-mobile-web"));
const stamp = new Date().toISOString().slice(0, 10);
const output = resolve(
  argument("output", join(HERE, "..", "raw", `${stamp}-mobile-web-audit.json`)),
);
const port = Number(argument("port", 4197));
const runs = Number(argument("runs", 10));
const baseUrl = `http://127.0.0.1:${port}`;
const VIEWPORT = { width: 390, height: 844 };
/** `docs/specs/mobile-app.md`, R-Q2. */
const MINIMUM_TOUCH_TARGET = 44;
const ROUTES = ["/", "/journal", "/tasks", "/tags", "/people", "/trash"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

async function resolveFile(pathname) {
  const candidates = [
    join(exportDirectory, pathname),
    join(exportDirectory, `${pathname}.html`),
    join(exportDirectory, pathname, "index.html"),
    join(exportDirectory, "index.html"),
  ];
  for (const candidate of candidates) {
    if (!candidate.startsWith(exportDirectory)) continue;
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

function startStaticServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, baseUrl).pathname);
    resolveFile(pathname === "/" ? "/index.html" : pathname)
      .then((file) => {
        if (!file) {
          response.writeHead(404).end("not found");
          return;
        }
        response.writeHead(200, {
          "content-type": MIME[extname(file)] ?? "application/octet-stream",
          "cache-control": "no-store",
        });
        createReadStream(file).pipe(response);
      })
      .catch(() => response.writeHead(500).end("error"));
  });
  return new Promise((resolveServer) => {
    server.listen(port, "127.0.0.1", () => resolveServer(server));
  });
}

/**
 * Records, on the first animation frame where the shell is operable — every
 * destination in the tab bar, the toolbar's tree control and the note's own
 * heading — how long that took from navigation start.
 */
const INTERACTIVE_PROBE = `(() => {
  window.__consoleErrors = [];
  const original = console.error;
  console.error = (...args) => {
    window.__consoleErrors.push(args.map(String).join(' '));
    original(...args);
  };
  window.__interactiveAt = null;
  const ready = () =>
    document.querySelectorAll('[role="tablist"] [role="tab"]').length > 0 &&
    document.querySelector('[aria-label="Open notes tree"]') !== null &&
    document.querySelector('[role="heading"]') !== null;
  const poll = () => {
    if (window.__interactiveAt !== null) return;
    if (ready()) {
      window.__interactiveAt = performance.now();
      return;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})()`;

/** Opens an overlay by its accessible name and reports whether it was found. */
function press(label) {
  return `(() => {
    const control = Array.from(document.querySelectorAll('[aria-label]'))
      .find((candidate) => candidate.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!control) return false;
    control.click();
    return true;
  })()`;
}

const AUDIT = `(() => {
  const RENDERED = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const INTERACTIVE = [
    'button','a[href]','input','select','textarea',
    '[role="button"]','[role="tab"]','[role="link"]','[role="switch"]',
    '[role="checkbox"]','[role="radio"]','[role="menuitem"]','[role="treeitem"]',
  ].join(',');
  const controls = Array.from(document.querySelectorAll(INTERACTIVE)).filter(RENDERED);
  return controls.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      label: element.getAttribute('aria-label'),
      labelledBy: element.getAttribute('aria-labelledby'),
      text: (element.textContent ?? '').trim().slice(0, 60),
      hint: element.getAttribute('aria-describedby') ? true : undefined,
      disabled: element.getAttribute('aria-disabled') === 'true' || element.disabled === true,
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      tabIndex: element.tabIndex,
    };
  });
})()`;

const HEADINGS = `Array.from(document.querySelectorAll('[role="heading"],h1,h2,h3,h4,h5,h6'))
  .map((element) => ({
    level: Number(element.getAttribute('aria-level') ?? element.tagName.slice(1)) || null,
    text: (element.textContent ?? '').trim().slice(0, 60),
  }))`;

function accessibleName(entry) {
  if (entry.label && entry.label.trim().length > 0) return entry.label.trim();
  if (entry.labelledBy) return `(labelledby ${entry.labelledBy})`;
  if (entry.text.length > 0) return entry.text;
  return null;
}

let server;
let browser;
let socket;
let profileDirectory;

try {
  await stat(join(exportDirectory, "index.html"));
} catch {
  console.error(`no export at ${exportDirectory}; run \`expo export --platform web\` first`);
  process.exit(2);
}

try {
  server = await startStaticServer();
  profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-mobile-web-"));
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
    { ...VIEWPORT, deviceScaleFactor: 3, mobile: true },
    sessionId,
  );
  await cdp.send(
    "Emulation.setTouchEmulationEnabled",
    { enabled: true, maxTouchPoints: 5 },
    sessionId,
  );
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INTERACTIVE_PROBE }, sessionId);

  const coldStart = [];
  for (let run = 0; run < runs; run += 1) {
    // A fresh origin per run would drop the HTTP cache too; the bundle is
    // served `no-store`, so every run parses and boots the bundle again.
    await cdp.send("Page.navigate", { url: `${baseUrl}/?run=${run}` }, sessionId);
    await waitFor(cdp, sessionId, "window.__interactiveAt !== null", "interactive tree", 600);
    coldStart.push(await evaluate(cdp, sessionId, "window.__interactiveAt"));
  }

  const surfaces = {};
  async function auditSurface(name) {
    await delay(350);
    const controls = await evaluate(cdp, sessionId, AUDIT);
    const described = controls.map((entry) => ({
      name: accessibleName(entry),
      role: entry.role ?? entry.tag,
      width: entry.width,
      height: entry.height,
      hint: entry.hint,
    }));
    surfaces[name] = {
      controls: controls.length,
      headings: await evaluate(cdp, sessionId, HEADINGS),
      consoleErrors: await evaluate(cdp, sessionId, `(window.__consoleErrors ?? []).length`),
      unnamed: described.filter((entry) => entry.name === null),
      undersized: described.filter(
        (entry) =>
          entry.height + 0.5 < MINIMUM_TOUCH_TARGET || entry.width + 0.5 < MINIMUM_TOUCH_TARGET,
      ),
      named: [...described].sort((left, right) =>
        String(left.name).localeCompare(String(right.name)),
      ),
    };
  }

  for (const route of ROUTES) {
    await cdp.send("Page.navigate", { url: `${baseUrl}${route}` }, sessionId);
    await waitFor(
      cdp,
      sessionId,
      `document.querySelectorAll('[role="tablist"] [role="tab"]').length > 0`,
      `${route} tab bar`,
      600,
    );
    await auditSurface(route);
  }

  // The two overlays a thumb reaches from the notes route: the tree sheet and
  // the account panel. Neither is in the DOM until it is opened.
  await cdp.send("Page.navigate", { url: `${baseUrl}/` }, sessionId);
  await waitFor(cdp, sessionId, "window.__interactiveAt !== null", "shell", 600);
  for (const [label, surface, settled] of [
    [
      "Open notes tree",
      "notes tree sheet",
      `Boolean(document.querySelector('[aria-label="Workspace tree"]'))`,
    ],
    ["Account and settings", "account panel", `document.body.innerText.includes('Account')`],
  ]) {
    if (!(await evaluate(cdp, sessionId, press(label)))) {
      surfaces[surface] = { error: `no control named ${label}` };
      continue;
    }
    await waitFor(cdp, sessionId, settled, surface, 200);
    await auditSurface(surface);
    await cdp.send("Page.reload", {}, sessionId);
    await waitFor(cdp, sessionId, "window.__interactiveAt !== null", "shell", 600);
  }

  const sorted = [...coldStart].sort((left, right) => left - right);
  const at = (quantile) => sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))];
  const round = (value) => Math.round(value * 100) / 100;
  const report = {
    environment: {
      date: new Date().toISOString(),
      viewport: VIEWPORT,
      deviceScaleFactor: 3,
      exportDirectory,
      platform: process.platform,
      node: process.version,
    },
    coldStartToInteractiveTreeMs: {
      runs: coldStart.length,
      p50: round(at(0.5)),
      p95: round(at(0.95)),
      max: round(sorted[sorted.length - 1]),
      min: round(sorted[0]),
      raw: coldStart.map(round),
    },
    minimumTouchTarget: MINIMUM_TOUCH_TARGET,
    surfaces,
  };

  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  const audited = Object.values(surfaces).filter((surface) => !surface.error);
  const undersized = audited.reduce((total, surface) => total + surface.undersized.length, 0);
  const unnamed = audited.reduce((total, surface) => total + surface.unnamed.length, 0);
  console.log(
    JSON.stringify(
      {
        coldStart: report.coldStartToInteractiveTreeMs,
        surfaces: Object.fromEntries(
          Object.entries(surfaces).map(([surface, value]) => [
            surface,
            value.error ?? {
              controls: value.controls,
              unnamed: value.unnamed.length,
              undersized: value.undersized.length,
            },
          ]),
        ),
        totals: { unnamed, undersized },
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${output}`);
} finally {
  socket?.close();
  await stopProcess(browser, "SIGKILL");
  server?.close();
  if (profileDirectory) {
    // Chrome releases the profile a moment after the process dies; a leftover
    // temporary directory must never replace the run's own failure.
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}
