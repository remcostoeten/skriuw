import { Suspense } from "react";
import { Bento } from "@/components/bento";
import { ClosingCta } from "@/components/closing-cta";
import { Download } from "@/components/download";
import { EngineeringStats } from "@/components/engineering-stats";
import { Faq } from "@/components/faq";
import { Hero } from "@/components/hero";
import { LatestRelease } from "@/components/latest-release";
import { ReleasePill } from "@/components/release-pill";
import { LogoWall } from "@/components/logo-wall";
import { Platforms } from "@/components/platforms";
import { Themes } from "@/components/themes";
import { Ticker } from "@/components/ticker";
import { JsonLd } from "@/components/page/json-ld";
import { homeSchema } from "@/data/seo";

export default function HomePage() {
  return (
    <>
      <JsonLd data={homeSchema} />
      <Hero
        badge={
          <Suspense fallback={<ReleasePill />}>
            <LatestRelease />
          </Suspense>
        }
      />
      <LogoWall />
      <Ticker />
      <Bento />
      <Platforms />
      <EngineeringStats />
      <Themes />
      <Download />
      <Faq />
      <ClosingCta />
    </>
  );
}
