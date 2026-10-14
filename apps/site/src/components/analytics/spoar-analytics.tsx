"use client";

import { createAnalytics } from "@spoar/sdk";
import { botSignals, errors, outboundLinks, speedInsights } from "@spoar/sdk/plugins";
import { useEffect } from "react";

type Config = { project: string; key: string; endpoint: string };

export function SpoarAnalytics() {
  useEffect(() => {
    const raw = process.env.NEXT_PUBLIC_RA_CONFIG;
    if (!raw) return;
    const analytics = createAnalytics({
      ...(JSON.parse(raw) as Config),
      plugins: [botSignals(), errors(), outboundLinks(), speedInsights()],
    });
    return () => {
      void analytics.shutdown();
    };
  }, []);
  return null;
}
