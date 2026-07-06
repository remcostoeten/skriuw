"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * Shared enter/exit motion for settings lists.
 *
 * Follows the Emil Kowalski animation guidance:
 * - animates only `transform` + `opacity` (hardware accelerated) plus a
 *   `grid-template-rows` 1fr→0fr collapse so neighbours slide into place
 *   without measuring heights
 * - keeps timing under 300ms and uses an ease-out curve so removals feel snappy
 * - falls back to a plain opacity fade under `prefers-reduced-motion`
 */

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)"

type Identifiable = { id: string | number }

/* -------------------------------- single item -------------------------------- */

function AnimatedItem({
  leaving,
  duration,
  itemClassName = "",
  children,
}: {
  leaving: boolean
  duration: number
  itemClassName?: string
  children: ReactNode
}) {
  // Start collapsed, then expand on the next frame so the enter transition runs.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  const open = entered && !leaving

  return (
    <div
      data-state={open ? "open" : "closed"}
      className={`grid transition-all ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform motion-reduce:translate-y-0 motion-reduce:transition-opacity ${
        open ? "grid-rows-[1fr] opacity-100 translate-y-0" : "grid-rows-[0fr] opacity-0 -translate-y-0.5"
      }`}
      style={{ transitionDuration: `${duration}ms`, transitionTimingFunction: EASE }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={itemClassName}>{children}</div>
      </div>
    </div>
  )
}

/* --------------------------------- keyed list -------------------------------- */

type Record<T> = { item: T; leaving: boolean }

export function AnimatedList<T extends Identifiable>({
  items,
  renderItem,
  duration = 260,
  className = "",
  itemClassName = "",
  empty,
}: {
  items: T[]
  renderItem: (item: T) => ReactNode
  duration?: number
  className?: string
  itemClassName?: string
  empty?: ReactNode
}) {
  const [records, setRecords] = useState<Record<T>[]>(() => items.map((item) => ({ item, leaving: false })))
  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reconcile incoming items with what's currently rendered. Present items keep
  // the incoming order (and refreshed data); removed items stay mounted with
  // `leaving: true` at their previous index until their exit animation finishes.
  useEffect(() => {
    setRecords((prev) => {
      const incomingIds = new Set(items.map((i) => String(i.id)))
      const present: Record<T>[] = items.map((item) => ({ item, leaving: false }))

      const leaving = prev.filter((r) => !incomingIds.has(String(r.item.id)))
      if (leaving.length === 0) return present

      const leavingIds = new Set(leaving.map((r) => String(r.item.id)))
      const result = [...present]
      prev.forEach((r, idx) => {
        if (leavingIds.has(String(r.item.id))) {
          result.splice(Math.min(idx, result.length), 0, { item: r.item, leaving: true })
        }
      })
      return result
    })
  }, [items])

  // Drop leaving records once their collapse transition has played.
  useEffect(() => {
    if (!records.some((r) => r.leaving)) return
    cleanupRef.current = setTimeout(() => {
      setRecords((prev) => prev.filter((r) => !r.leaving))
    }, duration + 20)
    return () => {
      if (cleanupRef.current) clearTimeout(cleanupRef.current)
    }
  }, [records, duration])

  if (records.length === 0 && empty) return <>{empty}</>

  return (
    <div className={className}>
      {records.map((r) => (
        <AnimatedItem key={r.item.id} leaving={r.leaving} duration={duration} itemClassName={itemClassName}>
          {renderItem(r.item)}
        </AnimatedItem>
      ))}
    </div>
  )
}

/* ------------------------------ single reveal ------------------------------- */

export function AnimatedReveal({
  show,
  children,
  className = "",
  duration = 280,
}: {
  show: boolean
  children: ReactNode
  className?: string
  duration?: number
}) {
  const [mounted, setMounted] = useState(show)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (show) {
      setMounted(true)
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
      return () => cancelAnimationFrame(raf)
    }
    setOpen(false)
    const t = setTimeout(() => setMounted(false), duration)
    return () => clearTimeout(t)
  }, [show, duration])

  if (!mounted) return null

  return (
    <div
      data-state={open ? "open" : "closed"}
      className={`grid transition-all will-change-transform motion-reduce:transition-opacity ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
      style={{ transitionDuration: `${duration}ms`, transitionTimingFunction: EASE }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className={className}>{children}</div>
      </div>
    </div>
  )
}
