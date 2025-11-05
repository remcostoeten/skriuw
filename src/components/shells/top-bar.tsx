"use client";

import { Button } from "@/shared/components/ui/button";
import Link from "next/link";
import { cn } from "utils";

/**
 * Configuration for action buttons
 *
 * @property text - Button label
 * @property href - Target link
 * @property variant - Button style variant
 */
export type TButtonConfig = {
  text?: string;
  href?: string;
  variant?: "default" | "secondary";
};

/**
 * TopBar wrapper props
 *
 * @property children - Custom content (left, center, right sections)
 * @property className - Optional wrapper class
 * @property showDefaultButtons - Show default Star/Download buttons
 * @property centerText - Text to display in center
 * @property buttons - Configure default buttons
 */
type TopBarProps = {
  children?: React.ReactNode;
  className?: string;
  showDefaultButtons?: boolean;
  centerText?: string;
  buttons?: {
    star?: TButtonConfig;
    download?: TButtonConfig;
  };
};

export function TopBar({
  children,
  className,
  showDefaultButtons = false,
  centerText,
  buttons
}: TopBarProps) {
  const renderDefaultButtons = () => {
    if (!showDefaultButtons) return null;

    const starButton = buttons?.star || {
      text: "Star on Github",
      href: "https://go.haptic.md/github",
      variant: "secondary" as const
    };

    const downloadButton = buttons?.download || {
      text: "Download",
      href: "https://go.haptic.md/download",
      variant: "default" as const
    };

    return (
      <div className="flex gap-1">
        <Link href={starButton.href || "#"} target="_blank" rel="noopener noreferrer">
          <Button
            size="sm"
            variant={starButton.variant}
            className="text-xs rounded-full h-[27px] px-2.5 transition-transform active:scale-[98%]"
          >
            {starButton.text}
          </Button>
        </Link>
        <Link href={downloadButton.href || "#"} target="_blank" rel="noopener noreferrer">
          <Button
            size="sm"
            variant={downloadButton.variant}
            className="text-xs rounded-full h-[27px] px-2.5 transition-transform active:scale-[98%]"
          >
            {downloadButton.text}
          </Button>
        </Link>
      </div>
    );
  };

  return (
    <header
      className={cn(
        "absolute top-0 w-full flex justify-between items-center h-9 border-b pl-20 bg-background z-40 px-1.5",
        className
      )}
    >
      {/* Left section - empty by default */}
      <div />

      {/* Center section - optional text */}
      {centerText && (
        <p className="pointer-events-none text-sm text-foreground/85 hover:text-foreground transition-all cursor-default outline-none -mr-[159px]">
          {centerText}
        </p>
      )}

      {/* Right section - custom children or default buttons */}
      {children ?? renderDefaultButtons()}
    </header>
  );
}
