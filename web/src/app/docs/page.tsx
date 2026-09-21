import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/primitives";
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
      "Features, architecture, the performance contract, and the changelog — read here, written in the repository.",
    url: "https://skriuw.com/docs/",
    images: [socialImage],
  },
};

export default function DocsIndexPage() {
  return (
    <>
      <PageHero
        kicker="Documentation"
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
          { label: "Browse the repository", href: repoUrl, variant: "outline" },
        ]}
      />

      <section className="border-b border-border bg-surface py-20">
        <Container>
          <div className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2">
            {docPages.map((page) => (
              <article key={page.slug} className="flex flex-col gap-3 bg-surface p-7">
                <span className="font-mono text-[12px] tracking-[0.06em] text-ink-400 uppercase">
                  {page.kicker}
                </span>
                <h2 className="text-[20px] font-medium text-ink-900">
                  <Link href={docHref(page)} className="hover:text-focus-ink focus-visible:text-focus-ink">
                    {page.title}
                  </Link>
                </h2>
                <p className="text-[15px] leading-[24px] text-ink-500">{page.description}</p>
                <p className="mt-2 font-mono text-[12px] text-ink-400">
                  <a
                    href={docSourceUrl(page)}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-700"
                  >
                    {page.source}
                  </a>
                </p>
              </article>
            ))}
          </div>
        </Container>
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
