import "server-only";
import { z } from "zod";
import { cloudUrl } from "@/data/cloud";
import { renderSharedMarkdown } from "@/modules/shared-note/render-markdown";

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
  images: z
    .array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/))
    .max(20)
    .default([]),
});

export async function fetchSharedNote(id: string): Promise<SharedNote | null> {
  if (!SHARE_ID.test(id)) return null;
  const shareUrl = `${cloudUrl(process.env.SKRIUW_CLOUD_URL)}/shares/${id}`;
  const response = await fetch(shareUrl, {
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Shared note request failed with ${response.status}`);
  const body = sharedNoteResponse.parse(await response.json());
  return {
    title: body.title,
    html: renderSharedMarkdown(
      body.markdown,
      new Map(body.images.map((imageId) => [imageId, `${shareUrl}/images/${imageId}`])),
    ),
    updatedAt: body.updatedAt,
  };
}
