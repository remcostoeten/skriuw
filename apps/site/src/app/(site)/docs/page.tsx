import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { card } from "@/components/frame/control";
import { SectionHead } from "@/components/frame/section-head";
import { PageCta, PageHero } from "@/components/page/page-shell";
import { docHref, docPages, docSourceUrl } from "@/data/docs";
import { repoUrl } from "@/data/content";
import { socialImage } from "@/data/seo";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "The Skriuw documentation: every feature, the architecture behind it, the performance contract it is held to, and the changelog.",
  alternates: { canonical: "/docs/" },
  openGraph: {
    title: "Skriuw documentation",
    description:
      "Features, architecture, the performance contract, and the changelog, read here and written in the repository.",
    url: "https://skriuw.com/docs/",
    images: [socialImage],
  },
};

export default function DocsIndexPage() {
  return (
    <>
      <PageHero
        index="05"
        label="documentation"
        marks={["Written in the repo", "Rendered here", "Always current"]}
        eyebrow="Skriuw documentation"
        title={
          <>
            The same documents that ship with the source,
            <span className="text-ink-500"> readable without leaving the site.</span>
          </>
        }
        lede="Every page here is generated at build time from the Markdown in the repository, so the site and the source can never drift apart."
        actions={[
          { label: "Every feature", href: "/docs/features/" },
          { label: "Browse the repository", href: repoUrl },
        ]}
      />

      <section>
        <SectionHead
          index="01"
          label="pages"
          title="Start with the features, then read the reasoning behind them."
        />
        <ul className="mt-8 grid list-none gap-3 p-0 sm:grid-cols-2">
          {docPages.map((page) => (
            <li key={page.slug} className={cn(card, "relative flex flex-col p-6")}>
              <span className="caps text-ink-400">{page.kicker}</span>
              <h2 className="mt-4 text-[17px] font-medium tracking-[-0.01em] text-ink-900">
                <Link
                  href={docHref(page)}
                  className="outline-none after:absolute after:inset-0 after:rounded-[10px] focus-visible:after:outline-2 focus-visible:after:outline-accent/60"
                >
                  {page.title}
                </Link>
              </h2>
              <p className="mt-2 text-[14px] leading-[22px] text-ink-500">{page.description}</p>
              <p className="relative z-[1] mt-auto pt-5 font-mono text-[11px] text-ink-400">
                <a
                  href={docSourceUrl(page)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-line underline-offset-3 transition-colors hover:text-ink-700"
                >
                  {page.source}
                </a>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <PageCta
        title="Documentation is nice. Writing in it is better."
        body="Open the browser build and try the editor these pages describe. Nothing to install, no account."
        actions={[
          { label: "Open the app", href: "/app/" },
          { label: "Download", href: "/download/" },
        ]}
      />
    </>
  );
}
