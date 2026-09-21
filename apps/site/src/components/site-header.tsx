"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Action, Container, Wordmark, cx } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { appUrl, navLinks } from "@/data/content";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cx(
        "sticky top-0 z-50 w-full border-b backdrop-blur-md",
        "transition-[background-color,border-color] duration-200 ease-out",
        scrolled ? "border-border/70 bg-surface/85" : "border-transparent bg-surface",
      )}
    >
      <Container className="flex h-[65px] items-center justify-between gap-6">
        <Link href="/" className="shrink-0 transition-colors duration-150 ease-out focus-visible:text-focus-ink">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-ink-500 transition-colors hover:text-ink-900 focus-visible:text-focus-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <ThemeToggle />
          <Action href={appUrl}>Open the app</Action>
        </div>
      </Container>
    </header>
  );
}
