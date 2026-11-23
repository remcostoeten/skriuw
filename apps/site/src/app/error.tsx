"use client";

import { useEffect } from "react";
import { StatusPage } from "@/components/page/status-page";
import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { ghostButton, outlineButton, primaryButton } from "@/components/frame/control";
import { repoUrl, statusSuggestions } from "@/data/content";

type Props = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function RouteError({ error, retry }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      code="500"
      label="site error"
      title="This page failed to render."
      lede="The site hit an error before it could show this page. Try again, or go back to the homepage. Your notes are stored by the app, not by this site, so this error doesn't affect them."
      actions={
        <>
          <button type="button" className={primaryButton} onClick={() => retry()}>
            Try again
          </button>
          <Link href="/" className={cn(outlineButton, "h-10 px-4")}>
            Back to the homepage
          </Link>
          <a href={`${repoUrl}/issues/new`} className={cn(ghostButton, "h-10 px-4")}>
            Report it
          </a>
        </>
      }
      note={error.digest ? `Reference: ${error.digest}` : undefined}
      suggestions={statusSuggestions}
    />
  );
}
