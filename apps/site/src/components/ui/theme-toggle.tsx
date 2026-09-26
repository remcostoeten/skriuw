"use client";

import { ThemeToggle as SharedThemeToggle } from "@skriuw/shared/components/theme-toggle";
import { useTheme } from "@/lib/theme";

type Props = {
  className?: string;
};

export function ThemeToggle({ className }: Props) {
  const { resolved, select } = useTheme();
  return <SharedThemeToggle value={resolved} onChange={select} className={className} />;
}
