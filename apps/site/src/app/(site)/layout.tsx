import type { ReactNode } from "react";
import { SiteFrame } from "@/components/frame/site-frame";

type Props = {
  children: ReactNode;
};

export default function SiteLayout({ children }: Props) {
  return <SiteFrame>{children}</SiteFrame>;
}
