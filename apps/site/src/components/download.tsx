"use client";

import Link from "next/link";
import { Action, Container, Rail } from "@/components/ui/primitives";
import { Apple, ArrowRight, Globe, Linux, Windows } from "@/components/ui/icons";
import { stagger, useReveal } from "@/components/ui/reveal";
import { installChannels, repoUrl } from "@/data/content";

const channelIcons = {
  browser: Globe,
  macos: Apple,
  linux: Linux,
  windows: Windows,
} as const;

export function Download() {
  const headingRef = useReveal<HTMLDivElement>();
  const gridRef = useReveal<HTMLDivElement>();

  return (
    <section id="download" className="bg-surface py-24">
      <Container>
        <div
          ref={headingRef}
          className="reveal-wipe flex flex-wrap items-start justify-between gap-6"
        >
          <Rail>
            <h2 className="font-serif text-[28px] leading-[34px] font-normal tracking-[-0.56px] text-ink-900">
              Free, on everything
            </h2>
            <Link
              href={`${repoUrl}/blob/daddy/LICENSE`}
              className="mt-2 inline-flex items-center gap-1.5 text-[15px] text-ink-500 transition-colors duration-150 ease-out focus-visible:text-focus-ink"
            >
              MIT licensed, no tiers, no seats, no feature held back
              <ArrowRight className="size-3.5" />
            </Link>
          </Rail>

          <div className="rounded-md border border-border px-3 py-1.5 font-mono text-sm text-ink-700">
            $0 forever
          </div>
        </div>

        <div ref={gridRef} className="reveal-group mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {installChannels.map((channel, index) => {
            const Icon = channelIcons[channel.icon];

            return (
              <article
                key={channel.name}
                style={stagger(index)}
                className="flex flex-col rounded-[14px] border border-border p-6 transition-colors duration-250 ease-out hover:border-ink-300"
              >
                <div className="flex items-center gap-2">
                  <Icon aria-hidden className="size-4 text-ink-700" />
                  <h3 className="text-[16px] font-semibold text-ink-900">{channel.name}</h3>
                  {channel.featured ? (
                    <span className="rounded bg-ink-200 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-700 uppercase">
                      Fastest
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-[13px] leading-[20px] text-ink-500">{channel.summary}</p>

                <p className="mt-4 text-[13px] text-ink-500">
                  {channel.hint.startsWith("`") ? (
                    <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[12px] text-ink-700">
                      {channel.hint.replaceAll("`", "")}
                    </code>
                  ) : (
                    channel.hint
                  )}
                </p>

                <div className="mt-auto pt-6">
                  <Action
                    href={channel.href}
                    variant={channel.ctaVariant}
                    className="w-full justify-center font-semibold"
                  >
                    {channel.cta}
                  </Action>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-6 rounded-[14px] border border-border p-8">
          <div>
            <h3 className="text-[16px] font-semibold text-ink-900">Build it yourself</h3>
            <p className="mt-2 max-w-[520px] text-[15px] text-ink-500">
              The whole thing is open source: the Rust core, the renderer, the benchmarks, and the
              fifty-one decision records behind them.
            </p>
          </div>
          <Action variant="outline" href={repoUrl}>
            View the source
          </Action>
        </div>
      </Container>
    </section>
  );
}
