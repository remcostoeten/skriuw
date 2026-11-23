import type { Metadata } from "next";
import { StatusPage } from "@/components/page/status-page";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { outlineButton, primaryButton } from "@/components/frame/control";
import { repoUrl, statusSuggestions } from "@/data/content";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist on skriuw.com.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      label="not found"
      title="Page not found."
      lede="The link is outdated or mistyped. Your notes are stored by the app, not by this site, so nothing is lost."
      actions={
        <>
          <Link href="/" className={primaryButton}>
            Back to the homepage
          </Link>
          <a href={`${repoUrl}/issues/new`} className={cn(outlineButton, "h-10 px-4")}>
            Report a broken link
          </a>
        </>
      }
      suggestions={statusSuggestions}
    />
  );
}
