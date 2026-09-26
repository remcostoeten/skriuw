import { Suspense } from "react";
import type { Metadata } from "next";

import { ReleaseList } from "@/modules/changelog/components/release-list";
import styles from "@/modules/changelog/components/changelog.module.css";
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
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.heading}>
          <h1>Changelog</h1>
          <p>Releases, improvements, and the changes behind them.</p>
        </header>

        <Suspense fallback={<Loading />}>
          <ReleaseList searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
