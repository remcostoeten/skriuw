"use client";

import { Action, Container } from "@/components/ui/primitives";
import { Sparkle } from "@/components/ui/icons";
import { stagger, useReveal } from "@/components/ui/reveal";
import { appUrl, releasesUrl } from "@/data/content";

export function ClosingCta() {
  const panelRef = useReveal<HTMLDivElement>();
  const contentRef = useReveal<HTMLDivElement>();

  return (
    <section className="bg-surface pb-16">
      <Container>
        <div
          ref={panelRef}
          className="reveal relative overflow-hidden rounded-[14px] border border-panel-border bg-panel px-6 py-24 text-center text-white"
        >
          <span aria-hidden className="pattern-field texture-dither" />

          <div ref={contentRef} className="reveal-group relative grid place-items-center">
            <span
              style={stagger(0)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-[13px] text-white/80"
            >
              <Sparkle className="size-3" />
              Free, open source, no account
            </span>

            <h2
              style={stagger(1)}
              className="mt-7 font-serif text-[56px] leading-[60px] font-normal tracking-[-1.5px]"
            >
              Open a page. Keep it yours.
            </h2>

            <p
              style={stagger(2)}
              className="mt-5 max-w-[440px] text-[16px] leading-[24px] text-white/65"
            >
              The full app runs in your browser right now, with no install and no sign-up. If you like it,
              the desktop build is the same renderer on the same Rust core.
            </p>

            <div style={stagger(3)} className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Action size="lg" variant="light" arrow="inline" href={appUrl}>
                Open the app
              </Action>
              <Action size="lg" variant="onDark" href={releasesUrl}>
                Download for desktop
              </Action>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
