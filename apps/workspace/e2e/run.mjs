import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { cpus, hostname, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = join(root, "app");
const port = Number(process.env.SKRIUW_E2E_PORT ?? 4192);
const baseUrl = `http://127.0.0.1:${port}`;
const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  root,
  outputIndex >= 0
    ? (process.argv[outputIndex + 1] ?? "apps/workspace/e2e/results/latest.json")
    : "apps/workspace/e2e/results/latest.json",
);
const chromeBinary = process.env.CHROME_BINARY ?? "google-chrome-stable";
const personalOnly = process.argv.includes("--personal-only");
const tasksOnly = process.argv.includes("--tasks-only");
const providerImportOnly = process.argv.includes("--provider-import-only");
const journalOnly = process.argv.includes("--journal-only");
const mermaidOnly = process.argv.includes("--mermaid-only");
function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

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

async function assertPortFree() {
  try {
    await fetch(`${baseUrl}/e2e/index.html`);
  } catch {
    return;
  }
  throw new Error(
    `something already serves ${baseUrl}; another e2e run or worktree owns the port, set SKRIUW_E2E_PORT to run alongside it`,
  );
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
    function fail(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
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
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
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
      mermaid: [...document.querySelectorAll('pre.code-block[data-language="mermaid"]')].map((block) => ({ mode: block.dataset.mermaid ?? null, error: block.querySelector('.mermaid-error')?.textContent ?? null, svg: block.querySelector('.mermaid-preview')?.innerHTML.length ?? null, source: block.querySelector('code')?.textContent.slice(0, 60) })),
    })`,
  );
  throw new Error(`timed out waiting for ${description}: ${diagnostic}`);
}

async function dispatchKey(cdp, sessionId, key, code, virtualKeyCode, text = "", modifiers = 0) {
  const common = {
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    modifiers,
    ...(text ? { text, unmodifiedText: text } : {}),
  };
  await cdp.send("Input.dispatchKeyEvent", { ...common, type: "keyDown" }, sessionId);
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
    'document.querySelector(\'[role="listbox"][aria-label="Destination"] [role="option"]\') !== null',
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
    importedNoteId && current.parents[current.parents[importedNoteId]] === "folder-a",
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
  await waitFor(
    cdp,
    sessionId,
    "document.querySelectorAll('.check-item').length === 2",
    "two editor tasks",
  );
  const firstId = await evaluate(
    cdp,
    sessionId,
    "document.querySelector('.check-item').dataset.taskId",
  );
  await evaluate(cdp, sessionId, `window.location.hash = '#/tasks/${firstId}'`);
  await waitFor(
    cdp,
    sessionId,
    "document.querySelectorAll('.task-checkbox').length === 2",
    "saved workspace tasks",
  );
  await evaluate(
    cdp,
    sessionId,
    "window.location.hash = '#/tasks/' + document.querySelector('.task-checkbox').dataset.taskId",
  );
  await waitFor(
    cdp,
    sessionId,
    "document.activeElement === document.querySelector('.task-checkbox')",
    "deep-linked task focus",
  );
  const secondTitle = await evaluate(
    cdp,
    sessionId,
    "document.querySelectorAll('.task-checkbox')[1].getAttribute('aria-label')",
  );
  await dispatchKey(cdp, sessionId, "ArrowDown", "ArrowDown", 40);
  await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelectorAll('.task-checkbox')[1].checked",
    "Space completes task",
  );
  assert(
    checks,
    "task-toggle-retains-moved-focus",
    await evaluate(
      cdp,
      sessionId,
      "document.activeElement === document.querySelectorAll('.task-checkbox')[1]",
    ),
    "focus stays on the second task after a deep link",
  );
  await dispatchKey(cdp, sessionId, "Home", "Home", 36);
  assert(
    checks,
    "task-home-focus",
    await evaluate(
      cdp,
      sessionId,
      "document.activeElement === document.querySelector('.task-checkbox')",
    ),
    "Home focuses first task",
  );
  await dispatchKey(cdp, sessionId, "End", "End", 35);
  assert(
    checks,
    "task-end-focus",
    await evaluate(
      cdp,
      sessionId,
      "document.activeElement === document.querySelectorAll('.task-checkbox')[1]",
    ),
    "End focuses last task",
  );
  await dispatchKey(cdp, sessionId, "Tab", "Tab", 9);
  assert(
    checks,
    "task-source-tab-focus",
    await evaluate(cdp, sessionId, "document.activeElement.classList.contains('task-source')"),
    "Tab reaches source button",
  );
  await dispatchKey(cdp, sessionId, "Tab", "Tab", 9, "", 8);
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await waitFor(cdp, sessionId, "window.location.hash === '#/notes'", "Enter opens source");
  assert(
    checks,
    "task-source-completion-matches",
    await evaluate(
      cdp,
      sessionId,
      `[...document.querySelectorAll('.check-item')].find(item => item.textContent === ${JSON.stringify(secondTitle)})?.dataset.checked === 'true'`,
    ),
    "source checklist reflects completion",
  );
  const uncheckedTitle = await evaluate(
    cdp,
    sessionId,
    "document.querySelector('.check-item[data-checked=false]').textContent",
  );
  await evaluate(
    cdp,
    sessionId,
    'window.__SKRIUW_WORKFLOW_E2E__.focusSelector(".check-item[data-checked=false] .check-item-box")',
  );
  await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelectorAll('.check-item[data-checked=true]').length === 2",
    "editor keyboard completion",
  );
  assert(
    checks,
    "editor-toggle-retains-focus",
    await evaluate(cdp, sessionId, "document.activeElement?.classList.contains('check-item-box')"),
    "editor checkbox retains keyboard focus",
  );
  assert(
    checks,
    "editor-checkbox-accessible-name",
    await evaluate(
      cdp,
      sessionId,
      `document.getElementById(document.activeElement.getAttribute("aria-labelledby"))?.textContent === ${JSON.stringify(uncheckedTitle)}`,
    ),
    "checkbox is named by task text",
  );
  const accessibility = await cdp.send("Accessibility.getFullAXTree", {}, sessionId);
  assert(
    checks,
    "editor-checkbox-accessibility-tree",
    accessibility.nodes.some(
      (node) =>
        node.role?.value === "checkbox" &&
        node.name?.value === uncheckedTitle &&
        node.properties?.some(
          (property) => property.name === "checked" && property.value.value === "true",
        ),
    ),
    "browser exposes the task name and checked state to assistive technology",
  );
}

const ALT = 1;
const SHIFT = 8;

async function journalHash(cdp, sessionId) {
  return evaluate(cdp, sessionId, "window.location.hash");
}

async function pressOutsideEntry(cdp, sessionId, key, code, virtualKeyCode, text, modifiers) {
  await evaluate(
    cdp,
    sessionId,
    "document.activeElement instanceof HTMLElement && document.activeElement.blur()",
  );
  await dispatchKey(cdp, sessionId, key, code, virtualKeyCode, text, modifiers);
}

async function checkJournalNavigation(cdp, sessionId, checks) {
  const openDialog = "document.querySelector('dialog[open] input[aria-label=\"Date to go to\"]')";
  const preview = "(document.querySelector('dialog[open] [role=status]')?.textContent ?? '')";
  await evaluate(cdp, sessionId, "window.location.hash = '#/journal/2026-01-31'");
  await waitFor(
    cdp,
    sessionId,
    'document.querySelector(\'main[aria-label="Journal"] .ProseMirror[contenteditable="true"]\') !== null',
    "journal entry editor",
  );
  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.settle()");
  await evaluate(
    cdp,
    sessionId,
    'window.__SKRIUW_WORKFLOW_E2E__.focusSelector(\'main[aria-label="Journal"] .ProseMirror[contenteditable="true"]\')',
  );
  await typeText(cdp, sessionId, "Draft kept across steps");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('main[aria-label=\"Journal\"] .ProseMirror')?.textContent.includes('Draft kept across steps') === true",
    "draft typed into the entry",
  );
  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.settle()");

  await pressOutsideEntry(cdp, sessionId, "]", "BracketRight", 221, "", ALT);
  await waitFor(
    cdp,
    sessionId,
    "window.location.hash === '#/journal/2026-02-28'",
    "alt+] steps a month, clamped",
  );
  assert(checks, "journal-next-month-shortcut", true, await journalHash(cdp, sessionId));
  await pressOutsideEntry(cdp, sessionId, "{", "BracketLeft", 219, "", SHIFT);
  await waitFor(
    cdp,
    sessionId,
    "window.location.hash === '#/journal/2026-02-21'",
    "shift+[ steps back a week",
  );
  await pressOutsideEntry(cdp, sessionId, "[", "BracketLeft", 219, "", ALT);
  await waitFor(
    cdp,
    sessionId,
    "window.location.hash === '#/journal/2026-01-21'",
    "alt+[ steps back a month",
  );
  await evaluate(cdp, sessionId, "window.location.hash = '#/journal/2026-01-31'");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('main[aria-label=\"Journal\"] .ProseMirror')?.textContent.includes('Draft kept across steps') === true",
    "entry content after stepping away and back",
  );
  assert(
    checks,
    "journal-entry-content-kept",
    true,
    "typed entry text survives month and week steps",
  );

  await pressOutsideEntry(cdp, sessionId, "d", "KeyD", 68, "d", 0);
  await waitFor(
    cdp,
    sessionId,
    `${openDialog} !== null && document.activeElement === ${openDialog}`,
    "go to date dialog with focused field",
  );
  assert(
    checks,
    "journal-go-to-suggestions",
    await evaluate(
      cdp,
      sessionId,
      "document.querySelectorAll('dialog[open] [role=option]').length > 0",
    ),
    "suggestions listed while empty",
  );
  await typeText(cdp, sessionId, "1/1/202");
  await waitFor(
    cdp,
    sessionId,
    `${preview}.includes('two or four digits')`,
    "inline error for a malformed year",
  );
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  assert(
    checks,
    "journal-go-to-invalid-stays",
    (await journalHash(cdp, sessionId)) === "#/journal/2026-01-31" &&
      (await evaluate(cdp, sessionId, `${openDialog} !== null`)),
    "Enter on an invalid date keeps the dialog open",
  );
  await replaceText(cdp, sessionId, "dec 2025");
  await waitFor(
    cdp,
    sessionId,
    `${preview}.includes('December 2025') && ${preview}.includes('Monday, December 1, 2025')`,
    "month preview with its opening day",
  );
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await waitFor(
    cdp,
    sessionId,
    "window.location.hash === '#/journal/2025-12-01' && document.querySelector('dialog[open]') === null",
    "go to dec 2025",
  );
  assert(checks, "journal-go-to-month", true, await journalHash(cdp, sessionId));

  await pressOutsideEntry(cdp, sessionId, "d", "KeyD", 68, "d", 0);
  await waitFor(cdp, sessionId, `${openDialog} !== null`, "go to date dialog reopened");
  await typeText(cdp, sessionId, "tomorrow");
  await dispatchKey(cdp, sessionId, "Escape", "Escape", 27);
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('dialog[open]') === null",
    "escape closes the dialog",
  );
  assert(
    checks,
    "journal-go-to-escape",
    (await journalHash(cdp, sessionId)) === "#/journal/2025-12-01",
    "Escape leaves the day unchanged",
  );
}

const MERMAID_BLOCK = "document.querySelector('pre.code-block[data-language=\"mermaid\"]')";
const MERMAID_SVG = `${MERMAID_BLOCK}?.querySelector('.mermaid-preview svg')`;

async function checkMermaidRender(cdp, sessionId, checks) {
  await evaluate(cdp, sessionId, "window.location.hash = '#/notes'");
  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.settle()");
  await evaluate(cdp, sessionId, 'window.__SKRIUW_WORKFLOW_E2E__.focusNamed("New note")');
  await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.settle()");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('.ProseMirror[contenteditable=\"true\"]') !== null",
    "editable note for mermaid checks",
  );
  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.focusEditor()");
  await replaceText(cdp, sessionId, "Diagram note");
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.settle()");
  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.focusEditor()");
  await typeText(cdp, sessionId, "Intro");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('.ProseMirror[contenteditable=\"true\"]').textContent.includes('Intro')",
    "body text before the fence",
  );
  const blocksBefore = await evaluate(
    cdp,
    sessionId,
    "document.querySelector('.ProseMirror[contenteditable=\"true\"]').childElementCount",
  );
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await waitFor(
    cdp,
    sessionId,
    `document.querySelector('.ProseMirror[contenteditable="true"]').childElementCount > ${blocksBefore}`,
    "fresh block for the mermaid fence",
  );
  await typeText(cdp, sessionId, "/sequence");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('.slash-menu[role=\"listbox\"]') !== null",
    "sequence slash command",
  );
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await waitFor(
    cdp,
    sessionId,
    `${MERMAID_BLOCK}?.dataset.mermaid === 'source'`,
    "mermaid fence inserted in source mode",
  );
  const caret = await evaluate(
    cdp,
    sessionId,
    `(() => {
    const block = ${MERMAID_BLOCK};
    const selection = window.getSelection();
    return {
      insideSource: block.querySelector('code').contains(selection.anchorNode),
      textAfterCaret: selection.anchorNode?.textContent?.slice(selection.anchorOffset, selection.anchorOffset + 5) ?? null,
      toolbarVisible: getComputedStyle(block.querySelector('.code-block-toolbar')).opacity,
      toggle: block.querySelector('.code-block-mode')?.textContent,
    };
  })()`,
  );
  assert(
    checks,
    "mermaid-template-caret-on-first-token",
    caret.insideSource && caret.textAfterCaret === "Alice" && caret.toggle === "Preview",
    JSON.stringify(caret),
  );

  await typeText(cdp, sessionId, "Dr");
  await waitFor(
    cdp,
    sessionId,
    `${MERMAID_BLOCK}?.textContent.includes('DrAlice->>Bob')`,
    "edited mermaid source",
  );
  await evaluate(cdp, sessionId, `${MERMAID_BLOCK}.querySelector('.code-block-mode').click()`);
  await waitFor(
    cdp,
    sessionId,
    `${MERMAID_BLOCK}?.dataset.mermaid === 'preview' && ${MERMAID_SVG} !== null && ${MERMAID_SVG}.textContent.includes('DrAlice')`,
    "rendered sequence preview with the edit",
  );
  const preview = await evaluate(
    cdp,
    sessionId,
    `(() => {
    const block = ${MERMAID_BLOCK};
    const svg = ${MERMAID_SVG};
    const code = block.querySelector('code');
    const rect = svg.getBoundingClientRect();
    return {
      selectedNode: block.classList.contains('ProseMirror-selectednode'),
      svgVisible: rect.width > 50 && rect.height > 30,
      sourceCollapsed: code.dataset.collapsed === 'true' && code.getBoundingClientRect().width <= 1,
      role: block.querySelector('.mermaid-preview').getAttribute('role'),
      label: block.querySelector('.mermaid-preview').getAttribute('aria-label'),
      fontImport: svg.innerHTML.includes('fonts.googleapis'),
      pageOverflow: document.querySelector('.editor-scroll')?.scrollWidth > document.querySelector('.editor-scroll')?.clientWidth,
    };
  })()`,
  );
  assert(
    checks,
    "mermaid-preview-visible-and-labelled",
    preview.selectedNode &&
      preview.svgVisible &&
      preview.sourceCollapsed &&
      preview.role === "img" &&
      preview.label === "Sequence diagram preview" &&
      !preview.fontImport &&
      !preview.pageOverflow,
    JSON.stringify(preview),
  );

  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await waitFor(
    cdp,
    sessionId,
    `${MERMAID_BLOCK}?.dataset.mermaid === 'source' && ${MERMAID_BLOCK}.querySelector('code').contains(window.getSelection().anchorNode)`,
    "Enter opens the source with the caret inside",
  );
  assert(
    checks,
    "mermaid-enter-opens-source",
    true,
    "Enter on the selected preview reveals the source",
  );
  await dispatchKey(cdp, sessionId, "Escape", "Escape", 27);
  await waitFor(
    cdp,
    sessionId,
    `${MERMAID_BLOCK}?.dataset.mermaid === 'preview' && ${MERMAID_BLOCK}.classList.contains('ProseMirror-selectednode')`,
    "Escape returns to the selected preview",
  );
  assert(
    checks,
    "mermaid-escape-returns-to-preview",
    true,
    "Escape in the source reselects the preview",
  );

  const before = await evaluate(cdp, sessionId, `${MERMAID_SVG}.getAttribute('style')`);
  await evaluate(cdp, sessionId, "document.documentElement.dataset.theme = 'paper'");
  await waitFor(
    cdp,
    sessionId,
    `${MERMAID_SVG}?.getAttribute('style') !== ${JSON.stringify(before)} && ${MERMAID_SVG}?.getAttribute('style').includes('40 16% 95%')`,
    "preview re-rendered with the paper palette",
  );
  await evaluate(cdp, sessionId, "document.documentElement.dataset.theme = 'midnight'");
  await waitFor(
    cdp,
    sessionId,
    `${MERMAID_SVG}?.getAttribute('style') === ${JSON.stringify(before)}`,
    "preview restored to the midnight palette",
  );
  assert(
    checks,
    "mermaid-theme-switch-rerenders",
    true,
    "a theme change re-renders the preview in place",
  );

  await evaluate(cdp, sessionId, `${MERMAID_BLOCK}.querySelector('.code-block-expand').click()`);
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('dialog.mermaid-expand[open] svg') !== null",
    "expanded diagram dialog",
  );
  assert(
    checks,
    "mermaid-expand-opens-dialog",
    await evaluate(
      cdp,
      sessionId,
      "document.activeElement === document.querySelector('dialog.mermaid-expand .mermaid-expand-close')",
    ),
    "expand focuses its close control",
  );
  await dispatchKey(cdp, sessionId, "Escape", "Escape", 27);
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('dialog.mermaid-expand') === null",
    "expanded diagram closed by Escape",
  );
  assert(checks, "mermaid-expand-escape-closes", true, "Escape closes the expanded diagram");

  await evaluate(cdp, sessionId, "window.__SKRIUW_WORKFLOW_E2E__.focusEditor()");
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await typeText(cdp, sessionId, "/er");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('.slash-menu[role=\"listbox\"]') !== null",
    "er slash command",
  );
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await waitFor(
    cdp,
    sessionId,
    "document.querySelectorAll('pre.code-block[data-language=\"mermaid\"]').length === 2",
    "second mermaid fence",
  );
  await dispatchKey(cdp, sessionId, "Escape", "Escape", 27);
  await waitFor(
    cdp,
    sessionId,
    "document.querySelectorAll('pre.code-block[data-mermaid=\"preview\"]').length === 2",
    "ER fence back in preview",
  );
  await dispatchKey(cdp, sessionId, "ArrowDown", "ArrowDown", 40);
  await typeText(cdp, sessionId, "/code");
  await waitFor(
    cdp,
    sessionId,
    "document.querySelector('.slash-menu[role=\"listbox\"]') !== null",
    "code slash command",
  );
  await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
  await typeText(cdp, sessionId, "plain code");
  const plain = await evaluate(
    cdp,
    sessionId,
    `(() => {
    const blocks = [...document.querySelectorAll('pre.code-block')];
    const last = blocks[blocks.length - 1];
    return { language: last.dataset.language, mermaid: last.dataset.mermaid ?? null, toggleHidden: last.querySelector('.code-block-mode').hidden, note: last.querySelector('.mermaid-note').hidden };
  })()`,
  );
  assert(
    checks,
    "mermaid-plain-code-block-untouched",
    plain.language === "" && plain.mermaid === null && plain.toggleHidden && plain.note,
    JSON.stringify(plain),
  );
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
    const attached = await cdp.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;
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
    await cdp.send("Page.navigate", { url: `${baseUrl}/e2e/index.html` }, sessionId);
    await waitFor(
      cdp,
      sessionId,
      "typeof window.__SKRIUW_WORKFLOW_E2E__ !== 'undefined'",
      "workflow controller",
    );
    function control(expression) {
      return evaluate(cdp, sessionId, `window.__SKRIUW_WORKFLOW_E2E__.${expression}`);
    }
    function settle() {
      return control("settle()");
    }
    function state() {
      return control("state()");
    }

    if (personalOnly) {
      await control('focusNamed("Command menu")');
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await typeText(cdp, sessionId, "Save note as template");
      await settle();
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await waitFor(
        cdp,
        sessionId,
        "window.__SKRIUW_WORKFLOW_E2E__.state().settings.noteTemplateIds?.length === 1",
        "saved template",
      );
      await control('focusNamed("Command menu")');
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await typeText(cdp, sessionId, "New note from template");
      await settle();
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await waitFor(
        cdp,
        sessionId,
        `document.querySelector('[aria-label="Note templates"]') !== null`,
        "template picker",
      );
      assert(
        checks,
        "personal-template-visible",
        await evaluate(cdp, sessionId, 'document.body.textContent.includes("Personal template")'),
        "personal source in picker",
      );
      const before = (await state()).nodeOrder.length;
      await dispatchKey(cdp, sessionId, "Enter", "Enter", 13);
      await waitFor(
        cdp,
        sessionId,
        `window.__SKRIUW_WORKFLOW_E2E__.state().nodeOrder.length === ${before + 1}`,
        "template copy",
      );
      assert(checks, "template-copy-created", true, "new canonical note created");
      await control('focusNamed("Search notes")');
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await settle();
      await evaluate(
        cdp,
        sessionId,
        `document.querySelector('input[aria-label="Search notes"]').focus()`,
      );
      await typeText(cdp, sessionId, "Alpha");
      await settle();
      await control('focusNamed("Save this search")');
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await waitFor(
        cdp,
        sessionId,
        'window.__SKRIUW_WORKFLOW_E2E__.state().settings.savedSearches?.includes("Alpha")',
        "saved query",
      );
      await control('focusNamed("Close search")');
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await evaluate(
        cdp,
        sessionId,
        `document.querySelector('nav[aria-label="Saved searches"] button').focus()`,
      );
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await waitFor(
        cdp,
        sessionId,
        `document.querySelector('input[aria-label="Search notes"]')?.value === "Alpha"`,
        "reopened query",
      );
      assert(checks, "saved-search-reopened", true, "saved query restores sidebar search");
      await control('focusNamed("Remove saved search Alpha")');
      await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
      await waitFor(
        cdp,
        sessionId,
        "window.__SKRIUW_WORKFLOW_E2E__.state().settings.savedSearches?.length === 0",
        "removed query",
      );
      assert(
        checks,
        "personal-browser-errors-empty",
        consoleErrors.length === 0 && pageErrors.length === 0,
        JSON.stringify({ consoleErrors, pageErrors }),
      );
      cdp.close();
      return {
        browser: browser.product,
        steps: ["personal-template", "saved-search"],
        checks,
        consoleErrors,
        pageErrors,
      };
    }

    if (mermaidOnly) {
      await checkMermaidRender(cdp, sessionId, checks);
      assert(
        checks,
        "mermaid-browser-errors-empty",
        consoleErrors.length === 0 && pageErrors.length === 0,
        JSON.stringify({ consoleErrors, pageErrors }),
      );
      cdp.close();
      return {
        browser: browser.product,
        steps: ["mermaid-render"],
        checks,
        consoleErrors,
        pageErrors,
      };
    }

    if (journalOnly) {
      await checkJournalNavigation(cdp, sessionId, checks);
      assert(
        checks,
        "journal-browser-errors-empty",
        consoleErrors.length === 0 && pageErrors.length === 0,
        JSON.stringify({ consoleErrors, pageErrors }),
      );
      cdp.close();
      return {
        browser: browser.product,
        steps: ["journal-navigation"],
        checks,
        consoleErrors,
        pageErrors,
      };
    }

    if (tasksOnly) {
      await checkTaskKeyboard(cdp, sessionId, checks);
      assert(
        checks,
        "task-browser-errors-empty",
        consoleErrors.length === 0 && pageErrors.length === 0,
        JSON.stringify({ consoleErrors, pageErrors }),
      );
      cdp.close();
      return {
        browser: browser.product,
        steps: ["task-keyboard"],
        checks,
        consoleErrors,
        pageErrors,
      };
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
      createdNoteId !== null &&
        !["note-alpha", "note-beta", "note-gamma", "note-root"].includes(createdNoteId),
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
      (await evaluate(cdp, sessionId, "document.querySelector('.slash-menu') === null")) === true,
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
    await waitFor(cdp, sessionId, "window.location.hash === '#/trash'", "trash route");
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
    await waitFor(cdp, sessionId, "window.location.hash === '#/notes'", "notes route");
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
    await waitFor(cdp, sessionId, "window.location.hash === '#/trash'", "trash route for purge");
    await settle();
    await control('focusNamed("Delete Beta note permanently")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      'document.querySelector(\'[role="group"][aria-label="Delete forever"] button\') !== null',
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
      "notes route before empty trash",
    );
    await settle();
    await control('focusTree("note-root")');
    await dispatchKey(cdp, sessionId, "Delete", "Delete", 46);
    await settle();
    await dispatchKey(cdp, sessionId, "6", "Digit6", 54, "", 10);
    await waitFor(cdp, sessionId, "window.location.hash === '#/trash'", "trash route for empty");
    await settle();
    await control('focusNamed("Empty trash")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      'document.querySelector(\'[role="group"][aria-label="Delete 1 item forever"] button\') !== null',
      "armed empty-trash confirmation",
    );
    await control('focusLastNamed("Delete 1 item forever")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-trash-empty",
      current.nodeTitles["note-root"] === undefined,
      JSON.stringify(current.nodeTitles),
    );
    steps.push("trash-empty-inline-confirm");

    await dispatchKey(cdp, sessionId, "1", "Digit1", 49, "", 10);
    await waitFor(cdp, sessionId, "window.location.hash === '#/notes'", "notes route after trash");
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
      'document.querySelector(\'[role="listbox"][aria-label="Version history"] [role="option"]\') !== null',
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
      'document.querySelector(\'[role="group"][aria-label="Restore"] button\') !== null',
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
      "keyboard-shortcut-rebinding-conflict",
      !JSON.stringify(current.settings).includes("ctrl+alt+p") &&
        (await evaluate(
          cdp,
          sessionId,
          "[...document.querySelectorAll('dialog[open] [role=\"status\"]')].some((node) => node.textContent.includes('Already used by'))",
        )),
      JSON.stringify(current.settings),
    );
    await control('focusNamed("Change shortcut for Open command palette")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await dispatchKey(cdp, sessionId, "u", "KeyU", 85, "", 3);
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-shortcut-rebinding",
      JSON.stringify(current.settings).includes("ctrl+alt+u"),
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
      'document.querySelector(\'[role="group"][aria-label="Replace workspace"] button\') !== null',
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
      'document.querySelector(\'[role="group"][aria-label="Restore backup"] button\') !== null',
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
    await waitFor(cdp, sessionId, "window.location.hash === '#/tags'", "tags route");
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
      'document.querySelector(\'form[aria-label="New tag"] input[aria-label="Name"]\') !== null',
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
      (await evaluate(cdp, sessionId, "document.activeElement?.getAttribute('data-entity-id')")) ===
        "tag-research",
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
      'document.querySelector(\'[role="group"][aria-label="Delete tag"] button\') !== null',
      "delete tag confirm group",
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
    await waitFor(cdp, sessionId, "window.location.hash === '#/people'", "people route");
    await settle();
    current = await state();
    assert(
      checks,
      "entity-people-empty-state",
      Object.keys(current.people).length === 0 &&
        (await evaluate(cdp, sessionId, "document.body.textContent.includes('No people yet')")),
      JSON.stringify(current.people),
    );
    await control('focusContaining("New person")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await waitFor(
      cdp,
      sessionId,
      'document.querySelector(\'form[aria-label="New person"] input[aria-label="Name"]\') !== null',
      "new person form",
    );
    await settle();
    await control(
      'focusSelector("form[aria-label=\\"New person\\"] input[aria-label=\\"Name\\"]")',
    );
    await typeText(cdp, sessionId, "Ada Lovelace");
    await dispatchKey(cdp, sessionId, "Enter", "Enter", 13, "\r");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-create-person",
      Object.values(current.people).includes("Ada Lovelace") &&
        !(await evaluate(cdp, sessionId, "document.body.textContent.includes('No people yet')")),
      JSON.stringify(current.people),
    );
    await openEntityMenu("Ada Lovelace", "Delete");
    await waitFor(
      cdp,
      sessionId,
      'document.querySelector(\'[role="group"][aria-label="Delete person"] button\') !== null',
      "delete person confirm group",
    );
    await control('focusNamed("Delete person")');
    await dispatchKey(cdp, sessionId, " ", "Space", 32, " ");
    await settle();
    current = await state();
    assert(
      checks,
      "keyboard-delete-person-restores-empty-state",
      Object.keys(current.people).length === 0 &&
        (await evaluate(cdp, sessionId, "document.body.textContent.includes('No people yet')")),
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
    assert(checks, "complete-workflow-step-set", steps.length === 19, JSON.stringify(steps));
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

await run(join(app, "node_modules/.bin/tsc"), ["--noEmit", "-p", join(app, "e2e/tsconfig.json")]);
await run(join(app, "node_modules/.bin/vite"), [
  "build",
  "--config",
  join(app, "e2e/vite.config.ts"),
  "--mode",
  "production",
]);
await assertPortFree();
const preview = spawn(
  join(app, "node_modules/.bin/vite"),
  ["preview", "--config", join(app, "e2e/vite.config.ts"), "--port", String(port)],
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
    command: `node apps/workspace/e2e/run.mjs${personalOnly ? " --personal-only" : journalOnly ? " --journal-only" : providerImportOnly ? " --provider-import-only" : tasksOnly ? " --tasks-only" : mermaidOnly ? " --mermaid-only" : ""} --output ${output}`,
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
