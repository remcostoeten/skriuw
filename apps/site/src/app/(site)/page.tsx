import { Suspense } from "react";
import { JsonLd } from "@/components/page/json-ld";
import { HomeCta } from "@/components/home/cta";
import { HomeFeatures } from "@/components/home/features";
import { HomeHero } from "@/components/home/hero";
import { LatestRelease } from "@/components/latest-release";
import { ReleasePill } from "@/components/release-pill";
import { HomePlatforms } from "@/components/home/platforms";
import { HomeProof } from "@/components/home/proof";
import { HomeSignals } from "@/components/home/signals";
import { HomeThemes } from "@/components/home/themes";
import { homeSchema } from "@/data/seo";

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
      <HomeSignals />
      <HomeFeatures />
      <HomeProof />
      <HomePlatforms />
      <HomeThemes />
      <HomeCta />
    </>
  );
}
