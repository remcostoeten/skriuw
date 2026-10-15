"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAnalytics } from "@spoar/sdk/react";
import { appUrl } from "@/data/content";
import type { Events, Placement } from "./client";

type Props = {
  placement: Placement;
  className?: string;
  children: ReactNode;
};

export function OpenAppLink({ placement, className, children }: Props) {
  const analytics = useAnalytics<Events>();
  return (
    <Link
      href={appUrl}
      className={className}
      onClick={() => analytics.track("open_app", { placement })}
    >
      {children}
    </Link>
  );
}
