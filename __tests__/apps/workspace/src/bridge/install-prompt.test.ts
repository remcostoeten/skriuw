import assert from "node:assert/strict";
import { test } from "vitest";
import {
  bindInstallPrompt,
  installOffered,
  promptInstall,
  runsInstalled,
  subscribeInstallOffer,
} from "@/bridge/install-prompt";

type Listener = (event: Event) => void;

function fakeWindow(standalone = false) {
  const listeners = new Map<string, Listener>();
  return {
    view: {
      navigator: {},
      matchMedia: () => ({ matches: standalone }),
      addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window,
    fire(type: string, event: Event) {
      listeners.get(type)?.(event);
    },
  };
}

function offerEvent(outcome: "accepted" | "dismissed") {
  let prevented = false;
  let prompted = 0;
  const event = {
    preventDefault: () => (prevented = true),
    prompt: async () => void (prompted += 1),
    userChoice: Promise.resolve({ outcome }),
  } as unknown as Event;
  return { event, prevented: () => prevented, prompted: () => prompted };
}

test("the browser's offer is held back until the user asks for it", async () => {
  const window = fakeWindow();
  const unbind = bindInstallPrompt(window.view);
  let notified = 0;
  const unsubscribe = subscribeInstallOffer(() => (notified += 1));
  assert.equal(installOffered(), false);
  const offer = offerEvent("accepted");
  window.fire("beforeinstallprompt", offer.event);
  assert.equal(offer.prevented(), true);
  assert.equal(installOffered(), true);
  assert.equal(notified, 1);
  assert.equal(await promptInstall(), "accepted");
  assert.equal(offer.prompted(), 1);
  assert.equal(installOffered(), false);
  assert.equal(await promptInstall(), "unavailable");
  unsubscribe();
  unbind();
});

test("an installed app withdraws the offer", () => {
  const window = fakeWindow();
  const unbind = bindInstallPrompt(window.view);
  window.fire("beforeinstallprompt", offerEvent("dismissed").event);
  assert.equal(installOffered(), true);
  window.fire("appinstalled", new Event("appinstalled"));
  assert.equal(installOffered(), false);
  unbind();
});

test("runsInstalled reads the standalone display mode", () => {
  assert.equal(runsInstalled(fakeWindow(true).view), true);
  assert.equal(runsInstalled(fakeWindow(false).view), false);
});
