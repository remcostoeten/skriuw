import { Suspense } from "react";
import type { Metadata } from "next";
import { JsonLd } from "@/components/page/json-ld";
import { HomeCta } from "@/components/home/cta";
import { HomeFeatures } from "@/components/home/features";
import { HomeHero } from "@/components/home/hero";
import { LatestRelease } from "@/modules/changelog/components/latest-release";
import { ReleasePill } from "@/modules/changelog/components/release-pill";
import { HomePlatforms } from "@/components/home/platforms";
import { HomeProof } from "@/components/home/proof";
import { HomeSignals } from "@/components/home/signals";
import { HomeThemes } from "@/components/home/themes";
import { homeSchema } from "@/data/seo";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={homeSchema} />
      <HomeHero
        badge={
          <Suspense fallback={<ReleasePill />}>
            <LatestRelease />
          </Suspense>
        }
      />
      <HomeFeatures />
      <HomeProof />
      <HomePlatforms />
      <HomeThemes />
      <HomeSignals />
      <HomeCta />
    </>
  );
}
