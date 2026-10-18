import { createRoot } from "react-dom/client";
import { bindAuthStartup } from "@/app/auth-startup";
import { bindPageServices } from "@/app/browser-startup";
import { startWorkspace } from "@/app/startup";
import { canonicalBrowserUrl } from "@/platform/browser/canonical-origin";
import "@remcostoeten/notifier/styles";
import "./styles.css";

function main(): void {
  const canonicalUrl = canonicalBrowserUrl(window.location.href);
  if (canonicalUrl) {
    window.location.replace(canonicalUrl);
    return;
  }
  bindAuthStartup();
  bindPageServices();
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("missing root container");
  }
  startWorkspace(createRoot(container));
  mountDevelopmentTools();
}

function mountDevelopmentTools(): void {
  if (!import.meta.env.DEV) return;
  void import("@remcostoeten/kreasz")
    .then(({ mountKreasz }) => {
      mountKreasz({ storagePrefix: "skriuw-kreasz" });
    })
    .catch((error: unknown) => {
      console.error("failed to load kreasz development tools", error);
    });
}

main();
