import assert from "node:assert/strict";
import { test } from "vitest";
import { quitApp, toggleMaximize } from "@/store/actions/window";

type TauriGlobal = { window?: Record<string, unknown> };

function recordWindowCommands(): { commands: string[]; restore: () => void } {
  const globals = globalThis as TauriGlobal;
  const previous = globals.window;
  const commands: string[] = [];
  globals.window = {
    ...previous,
    __TAURI_INTERNALS__: {
      metadata: { currentWindow: { label: "main" } },
      invoke: (command: string) => {
        commands.push(command);
        return Promise.resolve();
      },
      transformCallback: (callback: unknown) => callback,
    },
  };
  return {
    commands,
    restore: () => {
      globals.window = previous;
    },
  };
}

test("quitApp requests a close so the close-request flow persists state, never a destroy", () => {
  const recorder = recordWindowCommands();
  try {
    quitApp();
    assert.deepEqual(recorder.commands, ["plugin:window|close"]);
  } finally {
    recorder.restore();
  }
});

test("toggleMaximize asks the current window to toggle its maximized state", () => {
  const recorder = recordWindowCommands();
  try {
    toggleMaximize();
    assert.deepEqual(recorder.commands, ["plugin:window|toggle_maximize"]);
  } finally {
    recorder.restore();
  }
});
