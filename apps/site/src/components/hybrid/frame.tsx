"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { Wordmark } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { GithubSocial } from "@/components/ui/icons";
import { appUrl, navLinks, repoUrl } from "@/data/content";
import { useAccent } from "@/components/hybrid/accent-toggle";
import { ghostButton, outlineButton, primaryButton } from "@/components/hybrid/control";

const band = "hy-dots flex items-center gap-4 border-y border-dashed border-line bg-hy-bg px-6 py-4 max-[620px]:px-5";

function LivePill() {
  return (
    <p className="caps m-0 inline-flex items-center gap-2 rounded-full border border-line bg-hy-card px-2.5 py-1 text-ink-500">
      <span aria-hidden className="hy-live size-1.5 shrink-0 rounded-full bg-accent" />
      <span>local-first</span>
      <span className="text-ink-300">/</span>
      <span className="tabular-nums">v0.46</span>
    </p>
  );
}

function AccentToggle() {
  const { accent, toggle } = useAccent();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={accent === "orange"}
      title="Swap the single accent colour"
      className={cn(outlineButton, "gap-2")}
    >
      <span aria-hidden className="size-2 rounded-full bg-accent" />
      accent: {accent}
    </button>
  );
}

type Props = {
  children: ReactNode;
};

export function HybridFrame({ children }: Props) {
  return (
    <div className="hy-page">
      <div className="relative mx-auto my-10 w-[min(1200px,calc(100%-32px))] border-x border-dashed border-line max-[620px]:my-4">
        <header className={cn(band, "-mb-px flex-wrap justify-between")}>
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="shrink-0 text-ink-900">
              <Wordmark />
            </Link>
            <LivePill />
          </div>

          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.slice(0, 5).map((link) => (
              <Link key={link.label} href={link.href} className={ghostButton}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Link href={appUrl} className={cn(primaryButton, "h-7 px-3")}>
              Open the app
            </Link>
          </div>
        </header>

        <main className="hy-frame">{children}</main>

        <footer
          className={cn(
            band,
            "sticky bottom-0 z-10 -mt-px flex-wrap justify-between gap-y-2 font-mono text-xs text-ink-500",
          )}
        >
          <p className="m-0">
            <em>skriuw</em> · Frisian · “to write” · engineered by{" "}
            <a href="https://github.com/remcostoeten" target="_blank" rel="noreferrer" className="hy-link">
              Remco Stoeten
            </a>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AccentToggle />
            <Link href="/classic" className={outlineButton}>
              classic homepage
            </Link>
            <a href={repoUrl} target="_blank" rel="noreferrer" className={outlineButton}>
              <GithubSocial className="size-3" />
              Source
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
