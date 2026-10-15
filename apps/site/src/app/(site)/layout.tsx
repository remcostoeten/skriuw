import type { ReactNode } from "react";
import { SiteAnalytics } from "@/modules/analytics/provider";
import { SiteFrame } from "@/components/frame/site-frame";

type Props = {
  children: ReactNode;
};

export default function SiteLayout({ children }: Props) {
  return (
    <SiteAnalytics>
      <SiteFrame>{children}</SiteFrame>
    </SiteAnalytics>
  );
}
