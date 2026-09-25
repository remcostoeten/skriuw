import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins conditional class names and resolves conflicting Tailwind utilities,
 * keeping the last one.
 *
 * @param inputs - Strings, arrays, or objects accepted by `clsx`; falsy values are dropped.
 * @returns One space-separated class string.
 *
 * @example
 * ```ts
 * import { cn } from "@skriuw/shared/helpers/cn";
 *
 * cn("px-2 py-1", isActive && "bg-accent", "px-4"); // "py-1 bg-accent px-4"
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
