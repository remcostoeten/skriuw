"use client";

import { useState } from "react";
import { Action, Container, Rail } from "@/components/ui/primitives";
import { PlusMinus } from "@/components/ui/icons";
import { useReveal } from "@/components/ui/reveal";
import { faqItems, repoUrl } from "@/data/content";

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const headingRef = useReveal<HTMLDivElement>();
  const listRef = useReveal<HTMLDivElement>();

  return (
    <section className="bg-surface py-24">
      <Container>
        <div ref={headingRef} className="reveal-wipe flex flex-wrap items-start justify-between gap-6">
          <Rail>
            <h2 className="text-[36px] leading-[40px] font-medium tracking-[-0.72px]">
              <span className="block text-ink-900">Questions.</span>
              <span className="block text-ink-700">Mostly about where your</span>
              <span className="block text-ink-700">notes live and how to get them out.</span>
            </h2>
          </Rail>
          <Action href={`${repoUrl}/discussions`}>Ask on GitHub</Action>
        </div>

        <div ref={listRef} className="reveal mt-12 border-t border-border">
          {faqItems.map((item, index) => {
            const open = openIndex === index;

            return (
              <div key={item.question} className="border-b border-border">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                  className="group flex w-full items-center justify-between gap-6 py-6 text-left"
                >
                  <span className="text-[18px] font-medium text-ink-900 transition-colors duration-150 ease-out group-focus-visible:text-focus-ink">
                    {item.question}
                  </span>
                  <span className="text-ink-400 transition-colors duration-150 ease-out group-focus-visible:text-focus-ink">
                    <PlusMinus open={open} className="size-4" />
                  </span>
                </button>

                <div
                  className="grid transition-[grid-template-rows] duration-200 ease-out"
                  style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-[720px] pb-6 text-[15px] leading-[24px] text-ink-500">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
