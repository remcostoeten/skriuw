import type { Metadata } from "next";
import { StatusPage } from "@/components/page/status-page";
import { Action } from "@/components/ui/primitives";
import { repoUrl, statusSuggestions } from "@/data/content";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist on skriuw.com.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <StatusPage
      code="404 / Not found"
      title="This page is not here."
      lede="The link is either outdated or mistyped. Nothing was lost on your side: your notes live on your machine, not on this site."
      actions={
        <>
          <Action href="/" size="lg" arrow="disc">
            Back to the homepage
          </Action>
          <Action href={repoUrl} size="lg" variant="outline">
            Report a broken link
          </Action>
        </>
      }
      suggestions={statusSuggestions}
    />
  );
}
