"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { AnalyticsProvider } from "@spoar/sdk/react";
import { Analytics } from "@spoar/sdk/next";
import { createSiteAnalytics } from "./client";

type Props = {
  children: ReactNode;
};

export function SiteAnalytics({ children }: Props) {
  const [client] = useState(createSiteAnalytics);
  if (!client) return children;
  return (
    <AnalyticsProvider client={client}>
      <Analytics />
      {children}
    </AnalyticsProvider>
  );
}
