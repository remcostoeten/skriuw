"use client";

import { useEffect } from "react";

function hashTarget(hash: string) {
  try {
    return document.getElementById(decodeURIComponent(hash));
  } catch {
    return document.getElementById(hash);
  }
}

export function ScrollToHash() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    // The note streams in after the browser's own fragment scroll has already given up.
    hashTarget(hash)?.scrollIntoView({ behavior: "instant", block: "start" });
  }, []);

  return null;
}
