import type { ReactNode } from "react";
import { SpoarAnalytics } from "@/components/analytics/spoar-analytics";
import { SiteFrame } from "@/components/frame/site-frame";

type Props = {
  children: ReactNode;
};

export default function SiteLayout({ children }: Props) {
  return (
    <SiteFrame>
      <SpoarAnalytics />
      {children}
    </SiteFrame>
  );
}
