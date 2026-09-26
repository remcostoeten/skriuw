import { Suspense } from "react";
import { JsonLd } from "@/components/page/json-ld";
import { HybridCta } from "@/components/hybrid/cta";
import { HybridFeatures } from "@/components/hybrid/features";
import { HybridFrame } from "@/components/hybrid/frame";
import { HybridHero } from "@/components/hybrid/hero";
import { LatestRelease } from "@/components/latest-release";
import { ReleasePill } from "@/components/release-pill";
import { HybridPlatforms } from "@/components/hybrid/platforms";
import { HybridProof } from "@/components/hybrid/proof";
import { HybridSignals } from "@/components/hybrid/signals";
import { HybridThemes } from "@/components/hybrid/themes";
import { homeSchema } from "@/data/seo";

export default function HomePage() {
  return (
    <>
      <JsonLd data={homeSchema} />
      <HybridFrame>
        <HybridHero
          badge={
            <Suspense fallback={<ReleasePill />}>
              <LatestRelease />
            </Suspense>
          }
        />
        <HybridSignals />
        <HybridFeatures />
        <HybridProof />
        <HybridPlatforms />
        <HybridThemes />
        <HybridCta />
      </HybridFrame>
    </>
  );
}
