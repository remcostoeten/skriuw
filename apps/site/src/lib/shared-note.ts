import "server-only";
import { z } from "zod";
import { cloudUrl } from "@/data/cloud";
import { renderSharedMarkdown } from "@/lib/shared-note-markdown";

export type SharedNote = {
  title: string;
  html: string;
  updatedAt: number;
};

const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
const sharedNoteResponse = z.object({
  title: z.string(),
  markdown: z.string(),
  updatedAt: z.number().int(),
});

export async function fetchSharedNote(id: string): Promise<SharedNote | null> {
  if (!SHARE_ID.test(id)) return null;
  const response = await fetch(`${cloudUrl(process.env.SKRIUW_CLOUD_URL)}/shares/${id}`, {
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Shared note request failed with ${response.status}`);
  const body = sharedNoteResponse.parse(await response.json());
  return {
    title: body.title,
    html: renderSharedMarkdown(body.markdown),
    updatedAt: body.updatedAt,
  };
}
