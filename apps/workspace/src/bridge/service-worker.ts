import { isBrowserRuntime } from "./runtime";

const SCRIPT_URL = "./sw.js";
const ACTIVATE_UPDATE = "skriuw:activate-update";
/** iOS resumes installed PWAs instead of relaunching them, so the browser rarely checks for a new shell on its own. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

type UpdateHandler = () => void;

function activate(worker: ServiceWorker): void {
  worker.postMessage(ACTIVATE_UPDATE);
}

function watchInstalling(registration: ServiceWorkerRegistration, onUpdate: UpdateHandler): void {
  const installing = registration.installing;
  if (!installing) {
    return;
  }
  installing.addEventListener("statechange", () => {
    if (installing.state === "installed" && navigator.serviceWorker.controller) {
      onUpdate();
    }
  });
}

/**
 * Registers the shell cache worker. The desktop shell serves its renderer from
 * the Tauri protocol and has no offline problem to solve, so registration is
 * browser-only.
 *
 * `onUpdate` fires when a newer build finished installing while this session is
 * running. The session keeps its current shell until {@link applyUpdate} is
 * called, so a reload never lands mid-edit.
 */
export function registerShellWorker(onUpdate: UpdateHandler): () => void {
  // A cached shell in dev would serve a stale document past a module reload.
  if (import.meta.env.DEV || !isBrowserRuntime() || !("serviceWorker" in navigator)) {
    return () => {};
  }
  let disposed = false;
  let reloading = false;
  let registered: ServiceWorkerRegistration | null = null;
  function checkForUpdate(): void {
    if (document.visibilityState === "visible") {
      registered
        ?.update()
        .catch((error) => console.warn("shell worker update check failed", error));
    }
  }
  const updateTimer = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", checkForUpdate);
  function onControllerChange(): void {
    if (reloading) {
      return;
    }
    reloading = true;
    window.location.reload();
  }
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
  void navigator.serviceWorker
    .register(new URL(SCRIPT_URL, document.baseURI), { scope: "./" })
    .then((registration) => {
      if (disposed) {
        return;
      }
      registered = registration;
      if (registration.waiting && navigator.serviceWorker.controller) {
        onUpdate();
      }
      watchInstalling(registration, onUpdate);
      registration.addEventListener("updatefound", () => watchInstalling(registration, onUpdate));
    })
    .catch((error) => {
      console.error("shell worker registration failed", error);
    });
  return () => {
    disposed = true;
    window.clearInterval(updateTimer);
    document.removeEventListener("visibilitychange", checkForUpdate);
    navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  };
}

/**
 * Hands the page over to the build that is already installed and waiting. The
 * worker takes control, which reloads this tab through `controllerchange`.
 */
export async function applyShellUpdate(): Promise<void> {
  if (!isBrowserRuntime() || !("serviceWorker" in navigator)) {
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const waiting = registration?.waiting;
  if (waiting) {
    activate(waiting);
    return;
  }
  window.location.reload();
}
