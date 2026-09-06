import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { cpus, hostname, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = join(root, "app");
const baseUrl = "http://127.0.0.1:4192";
const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  root,
  outputIndex >= 0
    ? (process.argv[outputIndex + 1] ?? "app/e2e/results/latest.json")
    : "app/e2e/results/latest.json",
);
const chromeBinary = process.env.CHROME_BINARY ?? "google-chrome-stable";
const personalOnly = process.argv.includes("--personal-only");
const tasksOnly = process.argv.includes("--tasks-only");
const providerImportOnly = process.argv.includes("--provider-import-only");
const sleep = (milliseconds) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

function run(command, arguments_, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, arguments_, {
      cwd: root,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
      } else {
        reject(new Error(`${command} ${arguments_.join(" ")} failed (${code})\n${stderr}`));
      }
    });
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/e2e/index.html`);
      if (response.ok) {
        return;
      }
    } catch {
      await sleep(100);
    }
  }
  throw new Error("workflow preview did not become ready");
}

function launchChrome(profileDirectory) {
  return new Promise((resolveLaunch, reject) => {
    const child = spawn(
      chromeBinary,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDirectory}`,
        "--window-size=1440,900",
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
    const fail = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      reject(error);
    };
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
            JSON.stringify({
              id,
              method,
              params: parameters,
              ...(sessionId ? { sessionId } : {}),
            }),
          );
          return new Promise((resolveCall, rejectCall) =>
            pending.set(id, { resolveCall, rejectCall, method }),
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
          call?.rejectCall(new Error(`${call?.method ?? "CDP"}: ${message.error.message}`));
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

async function evaluate(cdp, sessionId, expression, timeoutMilliseconds = 30_000) {
  let result;
  try {
    result = await Promise.race([
      cdp.send(
        "Runtime.evaluate",
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      ),
      sleep(timeoutMilliseconds).then(() => {
        throw new Error(`evaluation timed out: ${expression.slice(0, 100)}`);
      }),
    ]);
  } catch (error) {
    throw new Error(`${String(error)}\nExpression: ${expression.slice(0, 500)}`);
  }
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
    );
  }
  return result.result.value;
}

async function waitFor(cdp, sessionId, expression, description) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(cdp, sessionId, expression)) {
      return;
    }
    await sleep(50);
  }
  const diagnostic = await evaluate(
    cdp,
    sessionId,
    `JSON.stringify({
      hash: window.location.hash,
      activeElement: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim().slice(0, 40) ?? null,
      openDialogs: [...document.querySelectorAll('dialog[open]')].map((dialog) => dialog.querySelector('h2')?.textContent ?? '(untitled)'),
      status: [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent.trim()).filter(Boolean).slice(0, 4),
    })`,
  );
  throw new Error(`timed out waiting for ${description}: ${diagnostic}`);
}

async function dispatchKey(
  cdp,
  sessionId,
  key,
  code,
  virtualKeyCode,
  text = "",
  modifiers = 0,
) {
  const common = {
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    modifiers,
    ...(text ? { text, unmodifiedText: text } : {}),
  };
  await cdp.send(
    "Input.dispatchKeyEvent",
    { ...common, type: "keyDown" },
    sessionId,
  );
  await cdp.send("Input.dispatchKeyEvent", { ...common, type: "keyUp" }, sessionId);
}

async function typeText(cdp, sessionId, value) {
  for (const character of value) {
    const upper = character.toUpperCase();
    const isLetter = /^[A-Z]$/u.test(upper);
    const isDigit = /^[0-9]$/u.test(character);
    const code = isLetter
      ? `Key${upper}`
      : isDigit
        ? `Digit${character}`
        : character === " "
          ? "Space"
          : "Slash";
    const virtualKeyCode = isLetter
      ? upper.charCodeAt(0)
      : isDigit
        ? character.charCodeAt(0)
        : character === " "
          ? 32
          : 191;
    await dispatchKey(cdp, sessionId, character, code, virtualKeyCode, character);
  }
}

async function replaceText(cdp, sessionId, value) {
  await dispatchKey(cdp, sessionId, "a", "KeyA", 65, "", 2);
  await dispatchKey(cdp, sessionId, "Backspace", "Backspace", 8);
  await typeText(cdp, sessionId, value);
}

async function readEditorLayout(cdp, sessionId) {
  return evaluate(
    cdp,
    sessionId,
    `(() => {
      const scrollHost = document.querySelector('.editor-scroll');
      const editor = document.querySelector('.ProseMirror[contenteditable="true"]');
      const rect = editor?.getBoundingClientRect();
      return {
        scrollTop: scrollHost?.scrollTop,
        clientWidth: scrollHost?.clientWidth,
        scrollWidth: scrollHost?.scrollWidth,
        editorTop: rect?.top,
        editorLeft: rect?.left,
        editorWidth: rect?.width,
      };
    })()`,
  );
}

function assert(checks, name, pass, detail) {
  checks.push({ name, pass, detail });
  if (!pass) {
    throw new Error(`${name}: ${detail}`);
  }
}

async function runProviderImport(cdp, sessionId, checks, control, settle, state) {
  let current = null;
  await dispatchKey(cdp, sessionId, "k", "KeyK", 75, "", 2);
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('dialog[open] [role=\"combobox\"]') !== null",
    "provider import command palette",
  );
  await typeText(cdp, sessionId, "Import provider export");
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('dialog[open] h2')?.textContent === 'Preview import'",
    "provider import preview",
  );
  await control('focusNamed("Destination")');
  await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('[role=\"listbox\"][aria-label=\"Destination\"] [role=\"option\"]') !== null",
    "import destination options",
  );
  await evaluate(
    cdp,
    sessionId,
    `[...document.querySelectorAll('[role="listbox"][aria-label="Destination"] [role="option"]')]
      .find((option) => option.textContent.trim() === 'Projects')
      .click()`,
  );
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('button[aria-label=\"Destination\"]')?.textContent.includes('Projects')",
    "import destination selected",
  );
  await control('focusContaining("Import 1 note")');
  await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
  await waitFor(
    cdp,
    sessionId,
    "document.body.textContent.includes('Import complete (Obsidian)')",
    "provider import completion",
  );
  await dispatchKey(cdp, sessionId, "Escape", "Escape", 27);
  await waitFor(
    cdp,
    sessionId,
    "[...document.querySelectorAll('dialog[open] h2')].every((heading) => !heading.textContent.includes('Import complete'))",
    "import report dismissed",
  );
  await settle();
  current = await state();
  const importedNoteId = Object.keys(current.nodeTitles).find(
    (id) => current.nodeTitles[id] === "Provider note",
  );
  assert(
    checks,
    "provider-import-destination-and-commit",
    importedNoteId &&
      current.parents[current.parents[importedNoteId]] === "folder-a",
    JSON.stringify({ importedNoteId, parents: current.parents }),
  );
  assert(
    checks,
    "provider-import-bridge-command-flow",
    current.bridgeCommands.includes("prepare_import_sources") &&
      current.bridgeCommands.includes("apply_workspace_operations"),
    JSON.stringify(current.bridgeCommands),
  );
  return current;
}

async function checkTaskKeyboard(cdp, sessionId, checks) {
  await evaluate(cdp, sessionId, "window.location.hash = '#/notes'");
  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.settle()");
  await evaluate(cdp, sessionId, 'window.__SKRIUW_WORKFLOW_E2E__.focusRow("note-alpha")');
  await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('.ProseMirror[contenteditable=\"true\"]') !== null",
    "editable note for task keyboard checks",
  );
  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.focusEditor()");
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13, "", 8);
  await typeText(cdp, sessionId, "- [] Plan the next release");
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await typeText(cdp, sessionId, "Review the keyboard experience");
  await waitFor(cdp, sessionId, "document.querySelectorAll('.check-item').length === 2", "two editor tasks");
  const firstId = await evaluate(cdp, sessionId, "document.querySelector('.check-item').dataset.taskId");
  await evaluate(cdp, sessionId, `window.location.hash = '#/tasks/${firstId}'`);
  await waitFor(cdp, sessionId, "document.querySelectorAll('.task-checkbox').length === 2", "saved workspace tasks");
  await evaluate(cdp, sessionId, "window.location.hash = '#/tasks/' + document.querySelector('.task-checkbox').dataset.taskId");
  await waitFor(cdp, sessionId, "document.activeElement === document.querySelector('.task-checkbox')", "deep-linked task focus");
  const secondTitle = await evaluate(cdp, sessionId, "document.querySelectorAll('.task-checkbox')[1].getAttribute('aria-label')");
  await dispatchKey(cdp, sessionId, "ArrowDown", "ArrowDown", 40);
  await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
  await waitFor(cdp, sessionId, "document.querySelectorAll('.task-checkbox')[1].checked", "Space completes task");
  assert(checks, "task-toggle-retains-moved-focus", await evaluate(cdp, sessionId,
    "document.activeElement === document.querySelectorAll('.task-checkbox')[1]"), "focus stays on the second task after a deep link");
  await dispatchKey(cdp, sessionId, "Home", "Home", 36);
  assert(checks, "task-home-focus", await evaluate(cdp, sessionId,
    "document.activeElement === document.querySelector('.task-checkbox')"), "Home focuses first task");
  await dispatchKey(cdp, sessionId, "End", "End", 35);
  assert(checks, "task-end-focus", await evaluate(cdp, sessionId,
    "document.activeElement === document.querySelectorAll('.task-checkbox')[1]"), "End focuses last task");
  await dispatchKey(cdp, sessionId, "Tab", "Tab", 9);
  assert(checks, "task-source-tab-focus", await evaluate(cdp, sessionId,
    "document.activeElement.classList.contains('task-source')"), "Tab reaches source button");
  await dispatchKey(cdp, sessionId, "Tab", "Tab", 9, "", 8);
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await waitFor(cdp, sessionId, "window.location.hash === '#/notes'", "Enter opens source");
  assert(checks, "task-source-completion-matches", await evaluate(cdp, sessionId,
    `[...document.querySelectorAll('.check-item')].find(item => item.textContent === ${JSON.stringify(secondTitle)})?.dataset.checked === 'true'`), "source checklist reflects completion");
  const uncheckedTitle = await evaluate(cdp, sessionId, "document.querySelector('.check-item[data-checked=false]').textContent");
  await evaluate(cdp, sessionId, 'window.__SKRIUW_WORKFLOW_E2E__.focusSelector(".check-item[data-checked=false] .check-item-box")');
  await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
  await waitFor(cdp, sessionId, "document.querySelectorAll('.check-item[data-checked=true]').length === 2", "editor keyboard completion");
  assert(checks, "editor-toggle-retains-focus", await evaluate(cdp, sessionId,
    "document.activeElement?.classList.contains('check-item-box')"), "editor checkbox retains keyboard focus");
  assert(checks, "editor-checkbox-accessible-name", await evaluate(cdp, sessionId,
    `document.getElementById(document.activeElement.getAttribute("aria-labelledby"))?.textContent === ${JSON.stringify(uncheckedTitle)}`), "checkbox is named by task text");
  const accessibility = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
  assert(checks, "editor-checkbox-accessibility-tree", accessibility.nodes.some((node) =>
    node.role?.value === "checkbox" && node.name?.value === uncheckedTitle &&
    node.properties?.some((property) => property.name === "checked" && property.value.value === "true")),
    "browser exposes the task name and checked state to assistive technology");

}

async function runWorkflow() {
  const profileDirectory = await mkdtemp(join(tmpdir(), "skriuw-c3-workflow-"));
  let chrome;
  const consoleErrors = [];
  const pageErrors = [];
  const checks = [];
  const steps = [];
  try {
    const launched = await launchChrome(profileDirectory);
    chrome = launched.child;
    const cdp = await connectCdp(launched.wsUrl);
    const browser = await cdp.send("Browser.getVersion");
    const target = await cdp.send("Target.createTarget", { url: "about:blank" });
    const attached = await cdp.send(
      "Target.attachToTarget",
      { targetId: target.targetId, flatten: true },
    );
    const sessionId = attached.sessionId;
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    cdp.on("Runtime.consoleAPICalled", (parameters, eventSession) => {
      if (eventSession === sessionId && parameters.type === "error") {
        consoleErrors.push(
          parameters.args
            .map((argument) => argument.description ?? argument.value)
            .join(" "),
        );
      }
    });
    cdp.on("Runtime.exceptionThrown", (parameters, eventSession) => {
      if (eventSession === sessionId) {
        pageErrors.push(
          parameters.exceptionDetails.exception?.description ??
            parameters.exceptionDetails.text,
        );
      }
    });
    await cdp.send(
      "Page.navigate",
      { url: `${baseUrl}/e2e/index.html` },
      sessionId,
    );
    await waitFor(
      cdp,
      sessionId,
      "typeof window.__SKRIUW_WORKFLOW_E2E__ !== 'undefined'",
      "workflow controller",
    );
    const control = (expression) =>
      evaluate(cdp, sessionId, `window.__SKRIUW_WORKFLOW_E2E__.${expression}`);
    const settle = () => control("settle()");
    const state = () => control("state()");

    if (personalOnly) {
      await control('focusNamed("Command menu")');
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await typeText(cdp, sessionId, "Save note as template");
      await settle();
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await waitFor(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.state().settings.noteTemplateIds?.length === 1", "saved template");
      await control('focusNamed("Command menu")');
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await typeText(cdp, sessionId, "New note from template");
      await settle();
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await waitFor(cdp, sessionId, `document.querySelector('[aria-label="Note templates"]') !== null`, "template picker");
      assert(checks, "personal-template-visible", await evaluate(cdp, sessionId, 'document.body.textContent.includes("Personal template")'), "personal source in picker");
      const before = (await state()).nodeOrder.length;
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await waitFor(cdp, sessionId, `window.__SKRIUW_WORKFLOW_E2E__.state().nodeOrder.length === ${before + 1}`, "template copy");
      assert(checks, "template-copy-created", true, "new canonical note created");
      await control('focusNamed("Search notes")');
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await settle();
      await evaluate(cdp, sessionId, `document.querySelector('input[aria-label="Search notes"]').focus()`);
      await typeText(cdp, sessionId, "Alpha");
      await settle();
      await control('focusNamed("Save this search")');
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await waitFor(cdp, sessionId, 'window.__SKRIUW_WORKFLOW_E2E__.state().settings.savedSearches?.includes("Alpha")', "saved query");
      await control('focusNamed("Close search")');
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await evaluate(cdp, sessionId, `document.querySelector('nav[aria-label="Saved searches"] button').focus()`);
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await waitFor(cdp, sessionId, `document.querySelector('input[aria-label="Search notes"]')?.value === "Alpha"`, "reopened query");
      assert(checks, "saved-search-reopened", true, "saved query restores sidebar search");
      await control('focusNamed("Remove saved search Alpha")');
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await waitFor(cdp, sessionId, 'window.__SKRIUW_WORKFLOW_E2E__.state().settings.savedSearches?.length === 0', "removed query");
      assert(checks, "personal-browser-errors-empty", consoleErrors.length === 0 && pageErrors.length === 0, JSON.stringify({ consoleErrors, pageErrors }));
      cdp.close();
      return { browser: browser.product, steps: ["personal-template", "saved-search"], checks, consoleErrors, pageErrors };
    }

    if (tasksOnly) {
      await checkTaskKeyboard(cdp, sessionId, checks);
      assert(checks, "task-browser-errors-empty", consoleErrors.length === 0 && pageErrors.length === 0, JSON.stringify({ consoleErrors, pageErrors }));
      cdp.close();
      return { browser: browser.product, steps: ["task-keyboard"], checks, consoleErrors, pageErrors };
    }

    let current = await state();
    assert(checks, "initial-route", current.route === "#/notes", current.route);
    assert(
      checks,
      "initial-active-state",
      current.activeNoteId === "note-alpha",
      current.activeNoteId,
    );
    assert(
      checks,
      "initial-empty-trash-state-exists",
      Boolean(
        await evaluate(
          cdp,
          sessionId,
          "document.querySelector('a[aria-label=\"Trash\"]') !== null",
        ),
      ),
      "trash route control missing",
    );

    if (providerImportOnly) {
      current = await runProviderImport(cdp, sessionId, checks, control, settle, state);
      assert(
        checks,
        "provider-import-console-clean",
        consoleErrors.length === 0 && pageErrors.length === 0,
        JSON.stringify({ consoleErrors, pageErrors }),
      );
      cdp.close();
      return {
        browser: browser.product,
        steps: ["provider-import"],
        checks,
        consoleErrors,
        pageErrors,
        finalState: current,
      };
    }

    await control('focusNamed("New note")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    const createdNoteId = current.activeNoteId;
    assert(
      checks,
      "keyboard-create-note",
      createdNoteId !== null && !["note-alpha", "note-beta", "note-gamma", "note-root"].includes(createdNoteId),
      createdNoteId,
    );
    await control("focusEditor()");
    await replaceText(cdp, sessionId, "Created note");
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
    await waitFor(
      cdp,
      sessionId,
      `window.__SKRIUW_WORKFLOW_E2E__.state().nodeTitles[${JSON.stringify(createdNoteId)}] === 'Created note'`,
      "created note title persistence",
    );
    current = await state();
    assert(
      checks,
      "keyboard-create-title",
      current.nodeTitles[createdNoteId] === "Created note",
      JSON.stringify(current.nodeTitles),
    );
    steps.push("create");

    await control(`focusTree(${JSON.stringify(createdNoteId)})`);
    await dispatchKey(cdp, sessionId, "r", "KeyR", 82, "r");
    await settle();
    await replaceText(cdp, sessionId, "Renamed note");
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-rename",
      current.nodeTitles[createdNoteId] === "Renamed note",
      current.nodeTitles[createdNoteId],
    );
    steps.push("rename");

    const alphaBefore = current.nodeOrder.indexOf("note-alpha");
    const betaBefore = current.nodeOrder.indexOf("note-beta");
    await control('focusTree("note-alpha")');
    await dispatchKey(cdp, sessionId, "ArrowDown", "ArrowDown", 40, "", 1);
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-sibling-reorder",
      current.nodeOrder.indexOf("note-alpha") === betaBefore &&
        current.nodeOrder.indexOf("note-beta") === alphaBefore,
      JSON.stringify(current.nodeOrder),
    );
    steps.push("sibling-reorder");

    async function moveThroughContextMenu(id, targetFolder) {
      await control(`focusRow(${JSON.stringify(id)})`);
      const point = await evaluate(
        cdp,
        sessionId,
        `(() => {
          const row = document.querySelector('[data-row-key="${id}"]');
          const rect = row.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`,
      );
      await cdp.send(
        "Input.dispatchMouseEvent",
        { type: "mousePressed", x: point.x, y: point.y, button: "right", clickCount: 1 },
        sessionId,
      );
      await cdp.send(
        "Input.dispatchMouseEvent",
        { type: "mouseReleased", x: point.x, y: point.y, button: "right", clickCount: 1 },
        sessionId,
      );
      await waitFor(
        cdp,
        sessionId,
        "[...document.querySelectorAll('[role=\"menuitem\"]')].some((item) => item.textContent.includes('Move to'))",
        "Move to context item",
      );
      await control('focusContaining("Move to")');
      await dispatchKey(cdp, sessionId, "ArrowRight", "ArrowRight", 39);
      await waitFor(
        cdp,
        sessionId,
        `[...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent.trim() === ${JSON.stringify(targetFolder)})`,
        `${targetFolder} submenu item`,
      );
      await control(`focusNamed(${JSON.stringify(targetFolder)})`);
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await settle();
    }

    await moveThroughContextMenu(createdNoteId, "Projects");
    current = await state();
    assert(
      checks,
      "keyboard-nest-through-context-menu",
      current.parents[createdNoteId] === "folder-a",
      current.parents[createdNoteId],
    );
    steps.push("nest");

    await moveThroughContextMenu("note-alpha", "Archive");
    current = await state();
    assert(
      checks,
      "context-menu-cross-folder-move",
      current.parents["note-alpha"] === "folder-b",
      current.parents["note-alpha"],
    );
    steps.push("cross-folder-move");

    await control(`focusRow(${JSON.stringify(createdNoteId)})`);
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    await control("focusEditor()");
    await typeText(cdp, sessionId, " workflow text");
    await settle();
    assert(
      checks,
      "keyboard-writing",
      await evaluate(
        cdp,
        sessionId,
        "document.querySelector('.ProseMirror[contenteditable=\"true\"]').textContent.includes('workflow text')",
      ),
      "typed content missing",
    );
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
    await typeText(cdp, sessionId, "/");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('.slash-menu[role=\"listbox\"]') !== null",
      "slash command menu",
    );
    await dispatchKey(cdp, sessionId, "ArrowDown", "ArrowDown", 40);
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
    await settle();
    assert(
      checks,
      "keyboard-slash-command",
      (await evaluate(
        cdp,
        sessionId,
        "document.querySelector('.slash-menu') === null",
      )) === true,
      "slash menu remained open",
    );
    steps.push("write-and-slash");

    await control("focusEditor()");
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
    await typeText(cdp, sessionId, "/diagram");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('.slash-menu[role=\"listbox\"]') !== null",
      "diagram slash command",
    );
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('.diagram-block') !== null",
      "embedded diagram",
    );
    assert(
      checks,
      "diagram-default-renders",
      await evaluate(cdp, sessionId, "document.querySelectorAll('.diagram-node').length === 3"),
      "default diagram nodes missing",
    );
    await control('focusSelector(".diagram-block")');
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
    const beforeDiagramNudge = await evaluate(
      cdp,
      sessionId,
      "document.activeElement?.style.transform ?? ''",
    );
    await dispatchKey(cdp, sessionId, "ArrowRight", "ArrowRight", 39, "", 8);
    await settle();
    assert(
      checks,
      "diagram-keyboard-nudge",
      (await evaluate(
        cdp,
        sessionId,
        `document.querySelector('.diagram-node[data-selected="true"]')?.style.transform !== ${JSON.stringify(beforeDiagramNudge)}`,
      )) === true,
      "Shift+ArrowRight did not move the selected diagram node",
    );
    await control('focusNamed("Add a connected step")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    assert(
      checks,
      "diagram-add-connected-step",
      await evaluate(cdp, sessionId, "document.querySelectorAll('.diagram-node').length === 4"),
      "keyboard add did not create a fourth node",
    );
    await control('focusNamed("Edit Mermaid source")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    assert(
      checks,
      "diagram-source-is-readable",
      await evaluate(
        cdp,
        sessionId,
        "document.querySelector('.diagram-source')?.value.startsWith('flowchart LR') === true",
      ),
      "Mermaid source editor did not open",
    );
    await dispatchKey(cdp, sessionId, "Escape", "Escape", 27);
    steps.push("diagram-keyboard-and-source");

    const beforeFindLayout = await readEditorLayout(cdp, sessionId);
    await dispatchKey(cdp, sessionId, "f", "KeyF", 70, "", 2);
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('input[aria-label=\"Find\"]') !== null",
      "find input",
    );
    await settle();
    const afterFindLayout = await readEditorLayout(cdp, sessionId);
    assert(
      checks,
      "find-panel-does-not-shift-editor-layout",
      JSON.stringify(afterFindLayout) === JSON.stringify(beforeFindLayout),
      `${JSON.stringify(beforeFindLayout)} -> ${JSON.stringify(afterFindLayout)}`,
    );
    const findOverlayWidth = await evaluate(
      cdp,
      sessionId,
      `(() => {
        const overlay = document.querySelector('[data-editor-utility-overlay]');
        if (overlay instanceof HTMLElement) overlay.dataset.workflowIdentity = 'stable';
        return overlay?.getBoundingClientRect().width ?? 0;
      })()`,
    );
    await dispatchKey(cdp, sessionId, "g", "KeyG", 71, "", 2);
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('input[aria-label^=\"Jump to line\"]') !== null",
      "jump-to-line input after find",
    );
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('input[aria-label=\"Find\"]') === null",
      "find panel exit after morph to jump",
    );
    assert(
      checks,
      "find-and-jump-share-one-resizing-overlay",
      await evaluate(
        cdp,
        sessionId,
        `(() => {
          const overlays = document.querySelectorAll('[data-editor-utility-overlay]');
          const overlay = overlays[0];
          return overlays.length === 1 &&
            overlay?.getAttribute('data-mode') === 'jump' &&
            overlay?.getAttribute('data-workflow-identity') === 'stable' &&
            overlay.getBoundingClientRect().width < ${JSON.stringify(findOverlayWidth)} &&
            document.querySelector('input[aria-label="Find"]') === null;
        })()`,
      ),
      JSON.stringify(await state()),
    );
    await dispatchKey(cdp, sessionId, "f", "KeyF", 70, "", 2);
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('input[aria-label=\"Find\"]') !== null",
      "find input after jump",
    );
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('input[aria-label^=\"Jump to line\"]') === null",
      "jump panel exit after morph to find",
    );
    assert(
      checks,
      "jump-switches-back-to-find-in-the-same-overlay",
      await evaluate(
        cdp,
        sessionId,
        `(() => {
          const overlays = document.querySelectorAll('[data-editor-utility-overlay]');
          const overlay = overlays[0];
          return overlays.length === 1 &&
            overlay?.getAttribute('data-mode') === 'search' &&
            overlay?.getAttribute('data-workflow-identity') === 'stable' &&
            document.querySelector('input[aria-label^="Jump to line"]') === null;
        })()`,
      ),
      JSON.stringify(await state()),
    );
    await typeText(cdp, sessionId, "workflow");
    await settle();
    assert(
      checks,
      "keyboard-find-query",
      await evaluate(
        cdp,
        sessionId,
        "document.querySelector('input[aria-label=\"Find\"]')?.value === 'workflow'",
      ),
      String(
        await evaluate(
          cdp,
          sessionId,
          "document.querySelector('input[aria-label=\"Find\"]')?.value",
        ),
      ),
    );
    await control('focusNamed("Show replace")');
    current = await state();
    assert(
      checks,
      "keyboard-focus-show-replace",
      current.activeElement === "Show replace",
      JSON.stringify(current),
    );
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    assert(
      checks,
      "keyboard-open-replace",
      await evaluate(
        cdp,
        sessionId,
        "document.querySelector('input[aria-label=\"Replace\"]') !== null",
      ),
      JSON.stringify(await state()),
    );
    await control('focusSelector("input[aria-label=\\"Replace\\"]")');
    await typeText(cdp, sessionId, "verified");
    await settle();
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('button[aria-label=\"Replace all\"]:not([disabled])') !== null",
      "enabled replace-all action",
    );
    await control('focusNamed("Replace all")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    assert(
      checks,
      "keyboard-find-replace",
      await evaluate(
        cdp,
        sessionId,
        "document.querySelector('.ProseMirror[contenteditable=\"true\"]').textContent.includes('verified text')",
      ),
      "replacement missing",
    );
    await dispatchKey(cdp, sessionId, "Escape", "Escape", 27);
    steps.push("find-replace");

    const beforeJumpLayout = await readEditorLayout(cdp, sessionId);
    await dispatchKey(cdp, sessionId, "g", "KeyG", 71, "", 2);
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('input[aria-label^=\"Jump to line\"]') !== null",
      "jump-to-line input",
    );
    await settle();
    const afterJumpLayout = await readEditorLayout(cdp, sessionId);
    assert(
      checks,
      "jump-to-line-does-not-shift-editor-layout",
      JSON.stringify(afterJumpLayout) === JSON.stringify(beforeJumpLayout),
      `${JSON.stringify(beforeJumpLayout)} -> ${JSON.stringify(afterJumpLayout)}`,
    );
    await dispatchKey(cdp, sessionId, "Escape", "Escape", 27);
    steps.push("jump-to-line-overlay");

    await control('focusNamed("Search notes")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    await control('focusSelector("input[aria-label=\\"Search notes\\"]")');
    await typeText(cdp, sessionId, "Gamma");
    await settle();
    await dispatchKey(cdp, sessionId, "ArrowDown", "ArrowDown", 40);
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-sidebar-search",
      current.activeNoteId === "note-gamma" && current.activeElement === "Gamma note",
      JSON.stringify(current),
    );
    steps.push("sidebar-search");

    await control('focusTree("note-beta")');
    await dispatchKey(cdp, sessionId, "Delete", "Delete", 46);
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-trash",
      current.deleted.includes("note-beta"),
      JSON.stringify(current.deleted),
    );
    await dispatchKey(cdp, sessionId, "6", "Digit6", 54, "", 10);
    await waitFor(
      cdp,
      sessionId,
      "window.location.hash === '#/trash'",
      "trash route",
    );
    await settle();
    await control('focusNamed("Restore Beta note")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-trash-restore",
      !current.deleted.includes("note-beta"),
      JSON.stringify(current.deleted),
    );
    await dispatchKey(cdp, sessionId, "1", "Digit1", 49, "", 10);
    await waitFor(
      cdp,
      sessionId,
      "window.location.hash === '#/notes'",
      "notes route",
    );
    await settle();
    await control('focusTree("note-beta")');
    await dispatchKey(cdp, sessionId, "Delete", "Delete", 46);
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-trash-again",
      current.deleted.includes("note-beta"),
      JSON.stringify(current.deleted),
    );
    await dispatchKey(cdp, sessionId, "6", "Digit6", 54, "", 10);
    await waitFor(
      cdp,
      sessionId,
      "window.location.hash === '#/trash'",
      "trash route for purge",
    );
    await settle();
    await control('focusNamed("Delete Beta note permanently")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('[role=\"group\"][aria-label=\"Delete forever\"] button') !== null",
      "armed purge confirmation",
    );
    await control('focusLastNamed("Delete forever")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-trash-purge",
      current.nodeTitles["note-beta"] === undefined,
      JSON.stringify(current.nodeTitles),
    );
    assert(
      checks,
      "trash-empty-and-disabled-state",
      await evaluate(
        cdp,
        sessionId,
        "document.body.textContent.includes('Trash is empty') && document.querySelector('button').disabled !== undefined",
      ),
      "empty trash state missing",
    );
    steps.push("trash-restore-purge");

    await dispatchKey(cdp, sessionId, "1", "Digit1", 49, "", 10);
    await waitFor(
      cdp,
      sessionId,
      "window.location.hash === '#/notes'",
      "notes route after trash",
    );
    await settle();
    await control('focusNamed("Search notes")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    await control('focusSelector("input[aria-label=\\"Search notes\\"]")');
    await typeText(cdp, sessionId, "Alpha");
    await settle();
    await dispatchKey(cdp, sessionId, "ArrowDown", "ArrowDown", 40);
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-select-history-note",
      current.activeNoteId === "note-alpha",
      JSON.stringify(current),
    );
    await evaluate(cdp, sessionId, "window.location.hash = '#/history/note-alpha'");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('[role=\"listbox\"][aria-label=\"Version history\"] [role=\"option\"]') !== null",
      "history route",
    );
    await control('focusContaining("Earlier alpha version")');
    current = await state();
    assert(
      checks,
      "keyboard-focus-history-version",
      current.activeElement.includes("Earlier alpha version"),
      JSON.stringify(current),
    );
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13, "\r");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('[aria-label=\"Preview mode\"]') !== null",
      "history preview",
    );
    await control('focusNamed("Restore")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('[role=\"group\"][aria-label=\"Restore\"] button') !== null",
      "armed history restore confirmation",
    );
    await control('focusLastNamed("Restore")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('[aria-label=\"Preview mode\"]') === null",
      "history preview closed after restore",
    );
    current = await state();
    assert(
      checks,
      "keyboard-history-restore",
      current.bridgeCommands.includes("read_history_version") &&
        current.bridgeCommands.includes("apply_workspace_operations"),
      JSON.stringify(current),
    );
    await control('focusNamed("Back to note")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      "window.location.hash === '#/notes'",
      "notes route after history",
    );
    await settle();
    assert(
      checks,
      "metadata-state",
      await evaluate(
        cdp,
        sessionId,
        "document.querySelector('aside[aria-label=\"Note metadata\"]')?.textContent.includes('Words')",
      ),
      "metadata details missing",
    );
    steps.push("metadata-history-restore");

    await dispatchKey(cdp, sessionId, "k", "KeyK", 75, "", 2);
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('dialog[open] [role=\"combobox\"]') !== null",
      "command palette",
    );
    await typeText(cdp, sessionId, "Toggle sidebar");
    await settle();
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
    await settle();
    assert(
      checks,
      "keyboard-command-palette",
      (await evaluate(
        cdp,
        sessionId,
        "document.querySelector('[role=\"tree\"]')?.closest('[aria-hidden=\"true\"]') !== null",
      )) === true,
      "palette command did not toggle sidebar",
    );
    await dispatchKey(cdp, sessionId, "b", "KeyB", 66, "", 2);
    await settle();
    steps.push("palette");

    current = await runProviderImport(cdp, sessionId, checks, control, settle, state);
    steps.push("provider-import");

    await control('focusNamed("Settings")');
    await dispatchKey(cdp, sessionId, ",", "Comma", 188, "", 2);
    await waitFor(
      cdp,
      sessionId,
      "[...document.querySelectorAll('dialog[open] h2')].some((heading) => heading.textContent === 'Settings')",
      "settings dialog",
    );
    await control('focusLabel("Reduce motion")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-reduced-motion-setting",
      current.settings.reduceMotion === true &&
        (await evaluate(
          cdp,
          sessionId,
          "document.documentElement.dataset.reduceMotion === 'true'",
        )),
      JSON.stringify(current.settings),
    );
    await control('focusNamed("Shortcuts")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    await control('focusNamed("Change shortcut for Open command palette")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await dispatchKey(cdp, sessionId, "p", "KeyP", 80, "", 3);
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-shortcut-rebinding",
      JSON.stringify(current.settings).includes("ctrl+alt+p"),
      JSON.stringify(current.settings),
    );
    steps.push("settings-shortcut-rebind");

    await control('focusNamed("Data & recovery")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    await control('failNext("export_workspace_archive", "injected export failure")');
    await control('focusNamed("Export archive")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "maintenance-error-state",
      current.statusText.some((text) => text.includes("injected export failure")),
      JSON.stringify(current.statusText),
    );
    await control('focusNamed("Export archive")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-archive-export",
      current.statusText.some((text) => text.includes("Exported")),
      JSON.stringify(current.statusText),
    );
    await control('focusNamed("Choose archive…")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      "document.body.textContent.includes('/tmp/skriuw-provider-export')",
      "chosen archive path",
    );
    await control('focusNamed("Replace…")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('[role=\"group\"][aria-label=\"Replace workspace\"] button') !== null",
      "armed archive replace confirmation",
    );
    await control('focusLastNamed("Replace workspace")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-archive-import-round-trip",
      current.statusText.some((text) => text.includes("Imported")),
      JSON.stringify(current.statusText),
    );
    await control('focusNamed("Back up now")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    await waitFor(
      cdp,
      sessionId,
      "document.body.textContent.includes('skriuw-backup-e2e.sqlite')",
      "backup inventory",
    );
    current = await state();
    assert(
      checks,
      "keyboard-backup",
      current.statusText.some((text) => text.includes("written and verified")),
      JSON.stringify(current.statusText),
    );
    await control('focusNamed("Restore…")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('[role=\"group\"][aria-label=\"Restore backup\"] button') !== null",
      "armed backup restore confirmation",
    );
    await control('focusLastNamed("Restore backup")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-recovery-restore",
      current.statusText.some((text) => text.includes("Backup restored")) &&
        (await evaluate(
          cdp,
          sessionId,
          "document.body.textContent.includes('rollback-e2e.sqlite')",
        )),
      JSON.stringify(current.statusText),
    );
    steps.push("archive-backup-recovery");

    await dispatchKey(cdp, sessionId, "Escape", "Escape", 27);
    await settle();
    current = await state();
    assert(
      checks,
      "settings-focus-restoration",
      current.activeElement === "Settings",
      current.activeElement,
    );
    await dispatchKey(cdp, sessionId, "4", "Digit4", 52, "", 10);
    await waitFor(
      cdp,
      sessionId,
      "window.location.hash === '#/tags'",
      "tags route",
    );
    await settle();
    current = await state();
    assert(
      checks,
      "entity-tags-route",
      current.route === "#/tags" &&
        Object.values(current.tags).sort().join(",") === "Ideas,Research",
      JSON.stringify(current),
    );
    await control('focusContaining("New tag")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('form[aria-label=\"New tag\"] input[aria-label=\"Name\"]') !== null",
      "new tag form",
    );
    await settle();
    await control('focusSelector("form[aria-label=\\"New tag\\"] input[aria-label=\\"Name\\"]")');
    await typeText(cdp, sessionId, "Urgent");
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13, "\r");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-create-tag",
      Object.values(current.tags).includes("Urgent") && current.dialog === null,
      JSON.stringify(current.tags),
    );
    await control('focusSelector("[data-entity-id=\\"tag-ideas\\"]")');
    await dispatchKey(cdp, sessionId, "ArrowDown", "ArrowDown", 40);
    assert(
      checks,
      "entity-row-arrow-focus",
      await evaluate(
        cdp,
        sessionId,
        "document.activeElement?.textContent.includes('Urgent') === true",
      ),
      "ArrowDown did not move entity row focus",
    );
    await dispatchKey(cdp, sessionId, "End", "End", 35);
    assert(
      checks,
      "entity-row-end-focus",
      await evaluate(
        cdp,
        sessionId,
        "document.activeElement?.textContent.includes('Urgent') === true",
      ),
      "End did not focus the last entity row",
    );
    await dispatchKey(cdp, sessionId, "Home", "Home", 36);
    assert(
      checks,
      "entity-row-home-focus",
      (await evaluate(
        cdp,
        sessionId,
        "document.activeElement?.getAttribute('data-entity-id')",
      )) === "tag-research",
      "Home did not focus the first entity row",
    );
    async function openEntityMenu(rowName, itemLabel) {
      await control(`focusNamed(${JSON.stringify(`Actions for ${rowName}`)})`);
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await waitFor(
        cdp,
        sessionId,
        `[...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent.includes(${JSON.stringify(itemLabel)}))`,
        `${itemLabel} entity context item`,
      );
      await settle();
      await evaluate(
        cdp,
        sessionId,
        "document.activeElement?.getAttribute('role') === 'menuitem' || document.querySelector('[role=\"menu\"] [role=\"menuitem\"]')?.focus()",
      );
      await settle();
      const isTarget = `document.activeElement?.getAttribute('role') === 'menuitem' && document.activeElement.textContent.includes(${JSON.stringify(itemLabel)})`;
      for (let hop = 0; hop < 8; hop += 1) {
        if (await evaluate(cdp, sessionId, isTarget)) {
          break;
        }
        await dispatchKey(cdp, sessionId, "ArrowDown", "ArrowDown", 40);
        await settle();
      }
      assert(
        checks,
        `entity-menu-focus-${itemLabel.toLowerCase()}-${rowName.toLowerCase().replace(/\s+/g, "-")}`,
        await evaluate(cdp, sessionId, isTarget),
        `menu focus never reached ${itemLabel}`,
      );
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
    }
    await openEntityMenu("Urgent", "Rename");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('input[aria-label=\"Rename tag Urgent\"]') !== null",
      "tag rename field",
    );
    await control('focusSelector("input[aria-label=\\"Rename tag Urgent\\"]")');
    await typeText(cdp, sessionId, "Priority");
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13, "\r");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-rename-tag",
      Object.values(current.tags).includes("Priority") &&
        !Object.values(current.tags).includes("Urgent"),
      JSON.stringify(current.tags),
    );
    await openEntityMenu("Priority", "Delete");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('dialog[open] h2')?.textContent === 'Delete tag?'",
      "delete tag dialog",
    );
    await control('focusNamed("Delete tag")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-delete-tag",
      Object.values(current.tags).sort().join(",") === "Ideas,Research",
      JSON.stringify(current.tags),
    );
    steps.push("entity-tags");

    await dispatchKey(cdp, sessionId, "5", "Digit5", 53, "", 10);
    await waitFor(
      cdp,
      sessionId,
      "window.location.hash === '#/people'",
      "people route",
    );
    await settle();
    current = await state();
    assert(
      checks,
      "entity-people-empty-state",
      Object.keys(current.people).length === 0 &&
        (await evaluate(
          cdp,
          sessionId,
          "document.body.textContent.includes('No people yet')",
        )),
      JSON.stringify(current.people),
    );
    await control('focusContaining("New person")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('form[aria-label=\"New person\"] input[aria-label=\"Name\"]') !== null",
      "new person form",
    );
    await settle();
    await control('focusSelector("form[aria-label=\\"New person\\"] input[aria-label=\\"Name\\"]")');
    await typeText(cdp, sessionId, "Ada Lovelace");
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13, "\r");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-create-person",
      Object.values(current.people).includes("Ada Lovelace") &&
        !(await evaluate(
          cdp,
          sessionId,
          "document.body.textContent.includes('No people yet')",
        )),
      JSON.stringify(current.people),
    );
    await openEntityMenu("Ada Lovelace", "Delete");
    await waitFor(
      cdp,
      sessionId,
      "document.querySelector('dialog[open] h2')?.textContent === 'Delete person?'",
      "delete person dialog",
    );
    await control('focusNamed("Delete person")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-delete-person-restores-empty-state",
      Object.keys(current.people).length === 0 &&
        (await evaluate(
          cdp,
          sessionId,
          "document.body.textContent.includes('No people yet')",
        )),
      JSON.stringify(current.people),
    );
    steps.push("entity-people");

    assert(
      checks,
      "browser-console-is-clean",
      consoleErrors.length === 0,
      JSON.stringify(consoleErrors),
    );
    assert(
      checks,
      "browser-page-errors-are-empty",
      pageErrors.length === 0,
      JSON.stringify(pageErrors),
    );
    assert(
      checks,
      "complete-workflow-step-set",
      steps.length === 18,
      JSON.stringify(steps),
    );
    await checkTaskKeyboard(cdp, sessionId, checks);
    steps.push("task-keyboard");
    cdp.close();
    return {
      browser: browser.product,
      steps,
      checks,
      consoleErrors,
      pageErrors,
      finalState: current,
    };
  } finally {
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
      const exited = new Promise((resolveExit) => chrome.once("exit", resolveExit));
      chrome.kill("SIGKILL");
      await exited;
    }
    await rm(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}

await run("pnpm", [
  "--dir",
  app,
  "exec",
  "tsc",
  "--noEmit",
  "-p",
  "e2e/tsconfig.json",
]);
await run("pnpm", [
  "--dir",
  app,
  "exec",
  "vite",
  "build",
  "--config",
  "e2e/vite.config.ts",
  "--mode",
  "production",
]);
const preview = spawn(
  join(app, "node_modules/.bin/vite"),
  ["preview", "--config", join(app, "e2e/vite.config.ts")],
  { cwd: root, stdio: "ignore", env: process.env },
);
try {
  await waitForServer();
  const workflow = await runWorkflow();
  const git = await run("git", ["rev-parse", "HEAD"], { capture: true });
  const result = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    revision: git.stdout.trim(),
    command: `node app/e2e/run.mjs${personalOnly ? " --personal-only" : providerImportOnly ? " --provider-import-only" : tasksOnly ? " --tasks-only" : ""} --output ${output}`,
    machine: {
      hostname: hostname(),
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model ?? "unknown",
      logicalCpuCount: cpus().length,
      node: process.version,
      chromeBinary,
    },
    workflow,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `C3 workflow passed ${workflow.steps.length} grouped steps and ${workflow.checks.length} assertions\n`,
  );
  process.stdout.write(`raw C3 workflow evidence: ${output}\n`);
} finally {
  if (preview.exitCode === null && preview.signalCode === null) {
    const exited = new Promise((resolveExit) => preview.once("exit", resolveExit));
    preview.kill("SIGTERM");
    await Promise.race([exited, sleep(5_000)]);
    if (preview.exitCode === null && preview.signalCode === null) {
      preview.kill("SIGKILL");
    }
  }
}
process.exit(0);
