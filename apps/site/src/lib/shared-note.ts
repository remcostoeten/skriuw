import "server-only";
import { z } from "zod";
import { renderSharedMarkdown } from "@/lib/shared-note-markdown";

export type SharedNote = {
  title: string;
  html: string;
  updatedAt: number;
};

const DEFAULT_CLOUD_URL = "https://skriuw-v2-cloud.remcostoeten.workers.dev";
const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
const sharedNoteResponse = z.object({
  title: z.string(),
  markdown: z.string(),
  updatedAt: z.number().int(),
});

function cloudUrl() {
  return (process.env.SKRIUW_CLOUD_URL ?? DEFAULT_CLOUD_URL).replace(/\/+$/, "");
}

export async function fetchSharedNote(id: string): Promise<SharedNote | null> {
  if (!SHARE_ID.test(id)) return null;
  const response = await fetch(`${cloudUrl()}/shares/${id}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Shared note request failed with ${response.status}`);
  const body = sharedNoteResponse.parse(await response.json());
  return {
    title: body.title,
    html: renderSharedMarkdown(body.markdown),
    updatedAt: body.updatedAt,
  };
}
