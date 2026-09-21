"use client";

import { useEffect } from "react";
import { StatusPage } from "@/components/page/status-page";
import { Action } from "@/components/ui/primitives";
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
      code="Error / Something broke"
      title="This page failed to render."
      lede="The site hit an unexpected error. Retrying usually fixes it. Nothing here touches your notes, so your workspace is unaffected."
      actions={
        <>
          <Action size="lg" arrow="disc" onClick={() => retry()}>
            Try again
          </Action>
          <Action href="/" size="lg" variant="outline">
            Back to the homepage
          </Action>
          <Action href={`${repoUrl}/issues/new`} size="lg" variant="ghost">
            Report it
          </Action>
        </>
      }
      note={error.digest ? `Reference: ${error.digest}` : undefined}
      suggestions={statusSuggestions}
    />
  );
}
