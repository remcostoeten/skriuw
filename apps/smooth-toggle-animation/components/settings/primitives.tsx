"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

/* ---------------------------------- layout ---------------------------------- */

export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-8 px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  )
}

export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-[var(--border)]/50 rounded-lg border border-[var(--border)]/60 bg-[var(--card)]/40 px-5">
      {children}
    </div>
  )
}

export function Row({
  title,
  description,
  visualization,
  children,
  disabled,
  focusId,
}: {
  title: string
  description?: string
  visualization?: React.ReactNode
  children?: React.ReactNode
  disabled?: boolean
  focusId?: string
}) {
  return (
    <div
      data-focus-id={focusId}
      className={`flex items-start justify-between gap-6 py-4 ${focusId ? "scroll-mt-24" : ""} ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        {visualization && <div className="mt-3">{visualization}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

/* ---------------------------------- controls ---------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  id?: string
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? "bg-[var(--primary)]" : "bg-[var(--muted)]"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  )
}

export function SettingsButton({
  children,
  onClick,
  variant = "outline",
  disabled,
  icon,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: "outline" | "destructive" | "primary"
  disabled?: boolean
  icon?: React.ReactNode
}) {
  const styles = {
    outline:
      "border border-border bg-transparent text-foreground hover:bg-accent",
    destructive:
      "border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 text-[var(--destructive)] hover:bg-[var(--destructive)]/20",
    primary: "border border-transparent bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${styles}`}
    >
      {icon}
      {children}
    </button>
  )
}

export function SettingsInput({
  value,
  onChange,
  placeholder,
  type = "text",
  readOnly,
  className = "",
  id,
  maxLength,
  title,
  onBlur,
  onKeyDown,
  ariaLabel,
}: {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  type?: string
  readOnly?: boolean
  className?: string
  id?: string
  maxLength?: number
  title?: string
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  ariaLabel?: string
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      readOnly={readOnly}
      maxLength={maxLength}
      title={title}
      aria-label={ariaLabel}
      className={`h-8 rounded-md border border-[var(--search-input-border)] bg-[var(--search-input)] px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-[var(--search-focus)] focus:outline-none ${
        readOnly ? "cursor-not-allowed opacity-60" : ""
      } ${className}`}
    />
  )
}

export function SettingsSelect({
  value,
  onChange,
  options,
  className = "",
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  className?: string
  ariaLabel: string
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="h-8 w-full appearance-none rounded-md border border-[var(--search-input-border)] bg-[var(--search-input)] pl-2.5 pr-7 text-xs text-foreground focus:border-[var(--search-focus)] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

/* ---------------------------------- dialogs ---------------------------------- */

export function SettingsDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close dialog" className="absolute inset-0 cursor-default bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-[var(--popover)] p-5 shadow-2xl shadow-black/40">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function TypePhraseDialog({
  open,
  onClose,
  title,
  description,
  phrase,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  phrase: string
  confirmLabel: string
  onConfirm: () => void
}) {
  const [value, setValue] = useState("")
  const matches = value === phrase
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue("")
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  return (
    <SettingsDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <SettingsButton onClick={onClose}>Cancel</SettingsButton>
          <SettingsButton
            variant="destructive"
            disabled={!matches}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </SettingsButton>
        </>
      }
    >
      <label className="block text-[11px] text-muted-foreground">
        {"To confirm, type "}
        <span className="font-mono text-foreground">{phrase}</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={phrase}
          className="mt-2 h-8 w-full rounded-md border border-[var(--search-input-border)] bg-[var(--search-input)] px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-[var(--search-focus)] focus:outline-none"
        />
      </label>
    </SettingsDialog>
  )
}
