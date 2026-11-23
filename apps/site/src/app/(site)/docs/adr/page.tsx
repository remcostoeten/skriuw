import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { badge } from "@/components/frame/control";
import { SectionHead } from "@/components/frame/section-head";
import { PageCta, PageHero } from "@/components/page/page-shell";
import { listAdrs } from "@/modules/docs/adr";
import { docHref } from "@/modules/docs/pages";
import { repoUrl } from "@/data/content";
import { socialImage } from "@/data/seo";

export const metadata: Metadata = {
  title: "Architecture decision records: why Skriuw is built the way it is",
  description:
    "The architecture decision records for Skriuw, from SQLite as canonical storage to optional cloud sync. Each record has the context, the decision and its consequences.",
  alternates: { canonical: "/docs/adr/" },
  openGraph: {
    siteName: "Skriuw",
    title: "Architecture decision records | Skriuw",
    description:
      "The context, decision and consequences of each Skriuw architecture decision, newest first.",
    url: "https://skriuw.com/docs/adr/",
    images: [socialImage],
  },
};

export default async function AdrIndexPage() {
  const records = await listAdrs();

  return (
    <>
      <PageHero
        index="05"
        label="decision records"
        marks={[`${records.length} records`, "Written in the repo", "Newest first"]}
        eyebrow="Architecture decision records"
        title={
          <>
            Architecture decisions,
            <span className="text-ink-500"> with the reasoning behind each.</span>
          </>
        }
        lede="Each record states the context, the decision and its consequences. Superseded records stay published and show their status."
        actions={[
          { label: "All documentation", href: "/docs/" },
          { label: "Browse docs/adr", href: `${repoUrl}/tree/daddy/docs/adr` },
        ]}
      />

      <section>
        <SectionHead index="01" label="records" title="Newest first." />
        <ol className="mt-8 list-none divide-y divide-dashed divide-line p-0">
          {records.map((record) => (
            <li
              key={record.slug}
              className="relative grid gap-2 py-5 md:grid-cols-[132px_minmax(0,1fr)]"
            >
              <p className="caps flex flex-wrap items-center gap-2 text-ink-400 md:flex-col md:items-start md:gap-1">
                <span className="text-accent tabular-nums">{record.kicker}</span>
                {record.date ? <time dateTime={record.date}>{record.date}</time> : null}
              </p>
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-[17px] font-medium tracking-[-0.01em] text-ink-900">
                  <Link
                    href={docHref(record)}
                    className="hy-link no-underline after:absolute after:inset-0 hover:text-accent focus-visible:outline-none"
                  >
                    {record.title}
                  </Link>
                  {record.status !== "accepted" ? (
                    <span className={cn(badge, "bg-ink-900/8 text-ink-400")}>{record.status}</span>
                  ) : null}
                </h2>
                <p className="mt-1.5 max-w-[680px] text-[14px] leading-[22px] text-ink-500">
                  {record.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <PageCta
        title="Try the app these decisions describe."
        body="The browser build needs no install and no account."
        actions={[
          { label: "Architecture", href: "/docs/architecture/" },
          { label: "Download", href: "/download/" },
        ]}
      />
    </>
  );
}
