import assert from "node:assert/strict";
import test from "node:test";
import {
  aiSettingsCommands,
  guardAiRegistrations,
  selectAiEnabled,
} from "../../../src/features/ai/opt-in-gate";
import { createCommandRegistry } from "../../../src/commands/registry";
import { noop } from "../../../src/shared/lib/noop";
import { DEFAULT_WORKSPACE_SETTINGS } from "../../../src/features/settings/settings-model";
import type { RendererState } from "../../../src/store/types";

function state(aiEnabled?: boolean): RendererState {
  return {
    settings: {
      ...DEFAULT_WORKSPACE_SETTINGS,
      ...(aiEnabled === undefined ? {} : { aiEnabled }),
    },
  } as RendererState;
}

test("AI selector defaults off and accepts only an explicit true preference", () => {
  assert.equal(selectAiEnabled(state()), false);
  assert.equal(selectAiEnabled(state(false)), false);
  assert.equal(selectAiEnabled(state(true)), true);
});

test("registration guard does not create disabled AI registrations", () => {
  let created = 0;
  const disabled = guardAiRegistrations(false, () => {
    created += 1;
    return ["command"];
  });
  assert.deepEqual(disabled, []);
  assert.equal(created, 0);

  const enabled = guardAiRegistrations(true, () => {
    created += 1;
    return ["command"];
  });
  assert.deepEqual(enabled, ["command"]);
  assert.equal(created, 1);
});

test("AI settings command registers only while enabled", () => {
  assert.equal(
    createCommandRegistry(aiSettingsCommands(false, noop, noop)).get("open-ai-settings"),
    undefined,
  );

  let opened = 0;
  const registry = createCommandRegistry(
    aiSettingsCommands(
      true,
      () => {
        opened += 1;
      },
      noop,
    ),
  );
  assert.equal(registry.get("open-ai-settings")?.label, "Open AI settings");
  registry.get("open-ai-settings")?.run();
  assert.equal(opened, 1);
});

test("model switcher command registers alongside AI settings only while enabled", () => {
  assert.equal(
    createCommandRegistry(aiSettingsCommands(false, noop, noop)).get("switch-ai-model"),
    undefined,
  );
  assert.deepEqual(aiSettingsCommands(false, noop, noop), []);

  const registry = createCommandRegistry(aiSettingsCommands(true, noop, noop));
  assert.equal(registry.get("switch-ai-model")?.label, "Switch AI model");
  assert.equal(registry.get("open-ai-settings")?.label, "Open AI settings");
});

test("prompt playground command registers only while enabled and hides on its own route", () => {
  assert.equal(
    createCommandRegistry(aiSettingsCommands(false, noop, noop)).get("open-prompt-playground"),
    undefined,
  );

  let openedPlayground = 0;
  const registry = createCommandRegistry(
    aiSettingsCommands(true, noop, () => {
      openedPlayground += 1;
    }),
  );
  const command = registry.get("open-prompt-playground");
  assert.equal(command?.label, "Open prompt playground");
  command?.run();
  assert.equal(openedPlayground, 1);

  const ui = { route: "prompt-playground", sidebarOpen: true, metadataOpen: true, settingsOpen: false } as const;
  assert.equal(command?.visible?.(state(true), ui), false);
  assert.equal(command?.visible?.(state(true), { ...ui, route: "notes" }), true);
});
