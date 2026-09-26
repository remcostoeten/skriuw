import { Suspense } from "react";
import type { Metadata } from "next";

import { ReleaseList } from "@/modules/changelog/components/release-list";
import Loading from "./loading";

type Props = {
  searchParams: Promise<{
    page?: string | string[];
  }>;
};

export const metadata: Metadata = {
  title: "Changelog",
  description: "Releases, improvements, and code changes.",
};

export default function Page({ searchParams }: Props) {
  return (
    <>
      <header className="py-12! max-[620px]:py-8!">
        <p className="caps flex items-center gap-2 text-ink-400">
          <span className="text-accent tabular-nums">06</span>
          changelog
        </p>
        <h1 className="mt-4 font-serif text-[40px] leading-[42px] font-normal tracking-[-1.2px] text-ink-900 md:text-[52px] md:leading-[52px] md:tracking-[-1.8px]">
          Changelog
        </h1>
        <p className="mt-4 max-w-[560px] text-[17px] leading-[26px] text-ink-500">
          Releases, improvements, and the changes behind them, straight from GitHub.
        </p>
      </header>

      <section>
        <Suspense fallback={<Loading />}>
          <ReleaseList searchParams={searchParams} />
        </Suspense>
      </section>
    </>
  );
}
