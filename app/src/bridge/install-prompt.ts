type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

type Listener = () => void;

let pending: InstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function publish(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Whether the app is already running from a home screen or app list. */
export function runsInstalled(view: Window = window): boolean {
  const standalone = (view.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || view.matchMedia("(display-mode: standalone)").matches;
}

/**
 * Keeps the browser's install offer for the moment the user asks for it.
 * Chromium fires `beforeinstallprompt` once per page load and only shows its
 * own banner if nothing claims the event; claiming it here lets the app put
 * "Install" where settings and the storage warning already are, so a
 * workspace that is at risk of eviction can be installed from the warning.
 * Safari has no such event, so nothing here may be assumed to fire.
 */
export function bindInstallPrompt(view: Window): () => void {
  function onOffer(event: Event): void {
    event.preventDefault();
    pending = event as InstallPromptEvent;
    publish();
  }
  function onInstalled(): void {
    pending = null;
    publish();
  }
  view.addEventListener("beforeinstallprompt", onOffer);
  view.addEventListener("appinstalled", onInstalled);
  return () => {
    view.removeEventListener("beforeinstallprompt", onOffer);
    view.removeEventListener("appinstalled", onInstalled);
    pending = null;
  };
}

export function installOffered(): boolean {
  return pending !== null;
}

export function subscribeInstallOffer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the platform install dialog. The offer is single-use either way. */
export async function promptInstall(): Promise<InstallOutcome> {
  const offer = pending;
  if (offer === null) {
    return "unavailable";
  }
  pending = null;
  publish();
  try {
    await offer.prompt();
    const choice = await offer.userChoice;
    return choice.outcome;
  } catch (error) {
    console.error("install prompt failed", error);
    return "unavailable";
  }
}
