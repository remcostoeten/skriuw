"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

interface PopoverProps {
  // Render prop for the trigger; receives the open toggler.
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: (props: { close: () => void }) => ReactNode
  align?: "start" | "end"
  className?: string
}

export function Popover({ trigger, children, align = "start", className }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={`absolute top-[calc(100%+6px)] z-50 ${
            align === "end" ? "right-0" : "left-0"
          } animate-in fade-in-0 zoom-in-95 duration-100 ${className ?? ""}`}
        >
          <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-xl shadow-black/40">
            {children({ close: () => setOpen(false) })}
          </div>
        </div>
      )}
    </div>
  )
}
