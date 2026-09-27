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
      label="something broke"
      title="This page failed to render."
      lede="The site hit an unexpected error. Retrying usually fixes it. Nothing here touches your notes, so your workspace is unaffected."
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
