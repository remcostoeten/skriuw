'use client'

import { Plus } from 'lucide-react'
import { useRef, useEffect } from 'react'
import { useFaq } from '../hooks/use-faq'
import { items } from '../types/faq'
import type { TItem } from '../types/faq'

function Answer({ item, isOpen }: { item: TItem; isOpen: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(
    function updateHeight() {
      if (!ref.current || !innerRef.current) return

      if (isOpen) {
        const height = innerRef.current.scrollHeight
        ref.current.style.height = `${height}px`
        ref.current.style.opacity = '1'
      } else {
        ref.current.style.height = '0px'
        ref.current.style.opacity = '0'
      }
    },
    [isOpen]
  )

  return (
    <div
      ref={ref}
      role="region"
      id={`answer-${item.id}`}
      aria-labelledby={`question-${item.id}`}
      className="overflow-hidden transition-all"
      style={{
        height: '0px',
        opacity: '0',
        transitionDuration: '280ms',
        transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
      }}
    >
      <div ref={innerRef} className="px-6 pb-5 pt-2">
        <p className="text-sm leading-relaxed text-neutral-400">{item.a}</p>
      </div>
    </div>
  )
}

function Item({ item, isOpen, onToggle }: { item: TItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-800/50 bg-neutral-950 transition-colors hover:border-neutral-700/50">
      <button
        type="button"
        id={`question-${item.id}`}
        aria-expanded={isOpen}
        aria-controls={`answer-${item.id}`}
        onClick={onToggle}
        onKeyDown={function handleKey(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
      >
        <span className="text-base font-medium text-white">{item.q}</span>
        <Plus
          className={`size-5 shrink-0 text-neutral-400 transition-transform ${
            isOpen ? 'rotate-45' : 'rotate-0'
          }`}
          style={{
            transitionDuration: '280ms',
            transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}
          aria-hidden="true"
        />
      </button>
      <Answer item={item} isOpen={isOpen} />
    </div>
  )
}

export default function Faq() {
  const { open, tog } = useFaq()

  return (
    <section
      className="mx-auto w-full max-w-6xl px-4 py-24"
      aria-labelledby="faq-heading"
    >
      <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-3">
          <h2
            id="faq-heading"
            className="text-4xl font-semibold tracking-tight text-white sm:text-5xl"
          >
            Frequently asked questions
          </h2>
          <p className="text-base text-neutral-400">
            Get answers to commonly asked questions.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {items.map(function renderItem(item) {
            return (
              <Item
                key={item.id}
                item={item}
                isOpen={open === item.id}
                onToggle={function handleToggle() {
                  tog(item.id)
                }}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
