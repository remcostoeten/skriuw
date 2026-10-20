import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { card, outlineButton } from "@/components/frame/control";
import { GithubSocial } from "@/components/ui/icons";
import { DocOutline } from "@/modules/docs/doc-outline";
import { docSourceUrl, type DocPage } from "@/modules/docs/pages";
import type { RenderedDoc } from "@/modules/docs/render-doc";

type Crumb = { label: string; href: string };
type Neighbour = { title: string; href: string };

type HeaderProps = {
  page: DocPage;
  lede: string;
  crumbs: Crumb[];
  meta?: ReactNode;
  actions?: ReactNode;
};

type NeighbourProps = {
  previous?: Neighbour;
  next?: Neighbour;
};

type ArticleProps = NeighbourProps & {
  page: DocPage;
  rendered: RenderedDoc;
  crumbs: Crumb[];
  meta?: ReactNode;
};

export function DocHeader({ page, lede, crumbs, meta, actions }: HeaderProps) {
  return (
    <header className="py-12! max-[620px]:py-8!">
      <p className="caps flex flex-wrap items-center gap-2 text-ink-400">
        {crumbs.map((crumb) => (
          <span key={crumb.href} className="contents">
            <Link href={crumb.href} className="transition-colors hover:text-ink-900">
              {crumb.label}
            </Link>
            <span aria-hidden className="text-ink-300">
              /
            </span>
          </span>
        ))}
        <span className="text-accent">{page.kicker}</span>
      </p>
      <h1 className="mt-4 max-w-[760px] font-serif text-[34px] leading-[40px] font-normal tracking-[-1px] text-balance text-ink-900 md:text-[42px] md:leading-[46px] md:tracking-[-1.4px]">
        {page.title}
      </h1>
      <p className="mt-4 max-w-[680px] text-[16px] leading-[25px] text-ink-500">
        {lede || page.description}
      </p>
      {meta}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {actions}
        <a href={docSourceUrl(page)} target="_blank" rel="noreferrer" className={outlineButton}>
          <GithubSocial className="size-3" />
          {page.source}
        </a>
      </div>
    </header>
  );
}

export function DocNeighbours({ previous, next }: NeighbourProps) {
  return (
    <nav aria-label="More documentation" className="grid gap-3 sm:grid-cols-2">
      {previous ? (
        <Link href={previous.href} className={cn(card, "flex flex-col gap-2 p-5")}>
          <span className="caps text-ink-400">← Previous</span>
          <span className="text-[16px] font-medium text-ink-900">{previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={next.href} className={cn(card, "flex flex-col gap-2 p-5 text-right")}>
          <span className="caps text-ink-400">Next →</span>
          <span className="text-[16px] font-medium text-ink-900">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}

export function DocArticle({ page, rendered, crumbs, meta, previous, next }: ArticleProps) {
  const { html, headings, lede } = rendered;

  return (
    <>
      <DocHeader page={page} lede={lede} crumbs={crumbs} meta={meta} />

      <section className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="doc-prose min-w-0" dangerouslySetInnerHTML={{ __html: html }} />

        {headings.length > 1 ? (
          <div className="hidden lg:block">
            <div className="sticky top-20">
              <p className="caps px-[22px] text-ink-400">On this page</p>
              <div
                data-outline-scroll
                className="no-scrollbar mt-4 max-h-[calc(100vh_-_196px)] overflow-y-auto overscroll-contain"
              >
                <DocOutline headings={headings} collapse={headings.length > 30} />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <DocNeighbours previous={previous} next={next} />
    </>
  );
}
