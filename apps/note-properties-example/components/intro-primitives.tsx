"use client";

import {
  AlignLeft,
  AtSign,
  Calendar,
  CheckSquare,
  Hash,
  Link2,
  List,
  MapPin,
  Phone,
  Star,
  User,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import {
  TAG_COLORS,
  type PropertyType,
  type TagColor,
} from "@/lib/note-properties";
import { ReactNode } from "react";

export const TYPE_ICON: Record<PropertyType, LucideIcon> = {
  text: AlignLeft,
  number: Hash,
  date: Calendar,
  select: CircleDot,
  "multi-select": List,
  person: User,
  url: Link2,
  checkbox: CheckSquare,
  rating: Star,
  location: MapPin,
  email: AtSign,
  phone: Phone,
};

export function Pill({
  label,
  color,
  onRemove,
  dot = false,
}: {
  label: string;
  color: TagColor;
  onRemove?: void | (() => void);
  dot?: boolean;
}) {
  const c = TAG_COLORS[color];
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-medium leading-5"
      style={{ backgroundColor: c.bg, color: c.fg }}
    >
      {dot && (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: c.dot }}
          aria-hidden
        />
      )}
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 ml-0.5 rounded-sm opacity-60 transition-opacity hover:opacity-100"
          aria-label={`Remove ${label}`}
        >
          <svg
            viewBox="0 0 16 16"
            className="size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}

export function Avatar({
  name,
  color,
  size = 18,
}: {
  name: string;
  color: TagColor;
  size?: number;
}) {
  const c = TAG_COLORS[color];
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        backgroundColor: c.dot,
        color: "oklch(0.2 0 0)",
        fontSize: size * 0.42,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
