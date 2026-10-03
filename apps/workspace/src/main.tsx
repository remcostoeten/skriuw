import { createRoot } from "react-dom/client";
import { bindAuthStartup } from "@/app/auth-startup";
import { bindPageServices } from "@/app/browser-startup";
import { startWorkspace } from "@/app/startup";
import "@remcostoeten/notifier/styles";
import "./styles.css";

function main(): void {
  bindAuthStartup();
  bindPageServices();
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("missing root container");
  }
  startWorkspace(createRoot(container));
}

main();
