"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@skriuw/shared/helpers/cn";
import { Wordmark } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { GithubSocial, XSocial } from "@/components/ui/icons";
import { footerColumns, navLinks, repoUrl } from "@/data/content";
import { controlSelected, ghostButton, outlineButton } from "@/components/frame/control";
import { HeaderAccount } from "@/components/frame/header-account";
import "./site-frame.css";

const bandSurface = "hy-dots border-y border-dashed border-line bg-hy-bg";

const band = `${bandSurface} flex items-center gap-4 px-6 py-4 max-[620px]:px-5`;

const headerLinks = navLinks.filter((link) => link.href.startsWith("/"));

function LivePill() {
  return (
    <p className="caps m-0 inline-flex items-center gap-2 rounded-full border border-line bg-hy-card px-2.5 py-1 text-ink-500 max-sm:hidden">
      <span aria-hidden className="hy-live size-1.5 shrink-0 rounded-full bg-accent" />
      local-first
    </p>
  );
}

function isCurrent(pathname: string, href: string) {
  if (href.includes("#")) {
    return false;
  }
  return pathname === href || pathname.startsWith(href);
}

function SiteMap() {
  return (
    <nav aria-label="Site map" className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
      <div>
        <Wordmark />
        <p className="mt-4 max-w-[300px] text-[14px] leading-[22px] text-ink-500">
          A local-first workspace for writing, journaling, and connected knowledge.
        </p>
        <p className="mt-6 flex items-center gap-1">
          <a href={repoUrl} aria-label="GitHub" className={ghostButton}>
            <GithubSocial className="size-3.5" />
          </a>
          <a href="https://x.com/remcostoeten" aria-label="X" className={ghostButton}>
            <XSocial className="size-3.5" />
          </a>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        {footerColumns.map((column) => (
          <div key={column.title}>
            <h2 className="caps text-ink-400">{column.title}</h2>
            <ul className="mt-4 grid list-none gap-2.5 p-0">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[14px] text-ink-500 transition-colors hover:text-ink-900 focus-visible:text-ink-900"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function useStuck() {
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      setStuck(entry.boundingClientRect.top < 0);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, stuck };
}

type Props = {
  children: ReactNode;
};

export function SiteFrame({ children }: Props) {
  const pathname = usePathname() ?? "/";
  const { sentinelRef, stuck } = useStuck();

  return (
    <div className="hy-page">
      <div className="relative mx-auto my-10 w-[min(1200px,calc(100%-32px))] border-x border-dashed border-line max-[620px]:my-4">
        <span
          ref={sentinelRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
        />
        <header data-stuck={stuck} className="site-header -mb-px">
          <span aria-hidden className={cn("site-header-band", bandSurface)} />
          <span aria-hidden className="site-header-float" />
          <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 py-4 max-[620px]:px-5 lg:grid lg:grid-cols-[1fr_auto_1fr]">
            <div className="flex min-w-0 items-center gap-4">
              <Link href="/" className="shrink-0 text-ink-900">
                <Wordmark />
              </Link>
              <LivePill />
            </div>

            <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
              {headerLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  aria-current={isCurrent(pathname, link.href) ? "page" : undefined}
                  className={cn(ghostButton, controlSelected)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2 lg:justify-self-end">
              <ThemeToggle />
              <HeaderAccount />
            </div>
          </div>
        </header>

        <main className="hy-frame">
          {children}
          <footer>
            <SiteMap />
          </footer>
        </main>

        <footer
          className={cn(
            band,
            "sticky bottom-0 z-10 -mt-px flex-wrap justify-between gap-y-2 font-mono text-xs text-ink-500",
          )}
        >
          <p className="m-0">
            <em>skriuw</em> · Frisian · “to write” · © 2026{" "}
            <a
              href="https://github.com/remcostoeten"
              target="_blank"
              rel="noreferrer"
              className="hy-link"
            >
              Remco Stoeten
            </a>{" "}
            · MIT
          </p>
          <a href={repoUrl} target="_blank" rel="noreferrer" className={outlineButton}>
            <GithubSocial className="size-3" />
            Source
          </a>
        </footer>
      </div>
    </div>
  );
}
