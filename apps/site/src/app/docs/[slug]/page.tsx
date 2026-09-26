import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/primitives";
import { DocOutline } from "@/components/docs/doc-outline";
import { docHref, docPages, docSourceUrl, findDocPage } from "@/data/docs";
import { renderDoc } from "@/lib/docs-content";
import { socialImage } from "@/data/seo";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return docPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = findDocPage(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/docs/${page.slug}/` },
    openGraph: {
      title: `${page.title} — Skriuw`,
      description: page.description,
      url: `https://skriuw.com/docs/${page.slug}/`,
      images: [socialImage],
    },
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const page = findDocPage(slug);

  if (!page) {
    notFound();
  }

  const { html, headings, lede } = await renderDoc(page);
  const index = docPages.indexOf(page);
  const previous = docPages[index - 1];
  const next = docPages[index + 1];

  return (
    <article className="bg-surface">
      <header className="border-b border-border">
        <Container className="py-10 lg:py-12">
          <p className="font-mono text-[12px] tracking-[0.08em] text-ink-400 uppercase">
            <Link href="/docs/" className="hover:text-ink-700">
              Documentation
            </Link>
            <span className="px-2 text-ink-300">/</span>
            {page.kicker}
          </p>
          <h1 className="mt-3 max-w-[760px] font-serif text-[28px] leading-[34px] font-normal tracking-[-0.5px] text-balance text-ink-900 md:text-[32px] md:leading-[38px]">
            {page.title}
          </h1>
          <p className="mt-3 max-w-[680px] text-[15px] leading-[24px] text-ink-500">
            {lede || page.description}
          </p>
          <p className="mt-4 font-mono text-[12px] text-ink-400">
            <a
              href={docSourceUrl(page)}
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink-700"
            >
              View {page.source} on GitHub
            </a>
          </p>
        </Container>
      </header>

      <Container className="grid gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_220px] lg:py-20">
        <div className="doc-prose min-w-0" dangerouslySetInnerHTML={{ __html: html }} />

        {headings.length > 1 ? (
          <div className="hidden lg:block">
            <div className="sticky top-[89px]">
              <p className="px-[22px] font-mono text-[12px] tracking-[0.06em] text-ink-400 uppercase">
                On this page
              </p>
              <div
                data-outline-scroll
                className="no-scrollbar mt-4 max-h-[calc(100vh_-_170px)] overflow-y-auto overscroll-contain"
              >
                <DocOutline headings={headings} collapse={headings.length > 30} />
              </div>
            </div>
          </div>
        ) : null}
      </Container>

      <div className="border-t border-border">
        <Container className="grid gap-px overflow-hidden py-12 sm:grid-cols-2">
          {previous ? (
            <Link
              href={docHref(previous)}
              className="rounded-card border border-border p-6 hover:bg-ink-100"
            >
              <span className="font-mono text-[12px] tracking-[0.06em] text-ink-400 uppercase">
                Previous
              </span>
              <span className="mt-2 block text-[17px] font-medium text-ink-900">
                {previous.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={docHref(next)}
              className="rounded-card border border-border p-6 text-right hover:bg-ink-100 sm:ml-px"
            >
              <span className="font-mono text-[12px] tracking-[0.06em] text-ink-400 uppercase">
                Next
              </span>
              <span className="mt-2 block text-[17px] font-medium text-ink-900">{next.title}</span>
            </Link>
          ) : null}
        </Container>
      </div>
    </article>
  );
}
