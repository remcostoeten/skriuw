import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { DialogFrame } from "./stories/overlays";
import "./storybook.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme");
if (theme) document.documentElement.dataset.theme = theme;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{params.get("frame") === "dialog" ? <DialogFrame /> : <App />}</StrictMode>,
);
