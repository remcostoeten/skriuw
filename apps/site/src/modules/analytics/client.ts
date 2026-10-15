import { createAnalytics } from "@spoar/sdk";
import {
  botSignals,
  errors,
  ignoreSelf,
  outboundLinks,
  scrollDepth,
  speedInsights,
} from "@spoar/sdk/plugins";
import { z } from "zod";
import type { DetectedOs } from "@/data/downloads";

const configSchema = z.object({
  project: z.string(),
  key: z.string(),
  endpoint: z.string(),
});

export type Placement = "hero" | "cta" | "header" | "footer";

export type Events = {
  download: { os: DetectedOs };
  open_app: { placement: Placement };
  changelog_compare: { release: number };
};

function readConfig() {
  const raw = process.env.NEXT_PUBLIC_RA_CONFIG;
  if (!raw) return null;
  const parsed = configSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

/**
 * @name createSiteAnalytics
 * @description Builds the Spoar client for the marketing pages from `NEXT_PUBLIC_RA_CONFIG`, or
 * returns null when the variable is missing so local runs and forks send nothing. Pageviews come
 * from the Next adapter in the provider, which reports route templates such as `/docs/[slug]`.
 *
 * @example
 * const analytics = createSiteAnalytics();
 * analytics?.track("open_app", { placement: "hero" });
 */
export function createSiteAnalytics() {
  const config = readConfig();
  if (!config) return null;
  return createAnalytics({
    ...config,
    pageviews: false,
    plugins: [
      botSignals(),
      errors(),
      ignoreSelf(),
      outboundLinks(),
      scrollDepth(),
      speedInsights(),
    ],
  });
}
