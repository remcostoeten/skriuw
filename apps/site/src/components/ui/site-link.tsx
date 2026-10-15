import type { ComponentProps } from "react";
import Link from "next/link";

type Props = Omit<ComponentProps<"a">, "href"> & {
  href: string;
};

function leavesTheSite(href: string) {
  return href.startsWith("/app/") || href.startsWith("http");
}

export function SiteLink({ href, children, ...props }: Props) {
  if (leavesTheSite(href)) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...props}>
      {children}
    </Link>
  );
}
