import { z } from "zod";

export const releaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable().optional(),
  html_url: z.string().url(),
  published_at: z.string().nullable(),
  draft: z.boolean(),
  prerelease: z.boolean(),
});

export const commitSchema = z.object({
  sha: z.string(),
});

export const comparisonSchema = z.object({
  html_url: z.string().url(),
  status: z.string(),
  total_commits: z.number(),
  commits: z.array(
    z.object({
      sha: z.string(),
      html_url: z.string().url(),
      commit: z.object({
        message: z.string(),
      }),
    }),
  ),
  files: z
    .array(
      z.object({
        filename: z.string(),
        status: z.string(),
        additions: z.number(),
        deletions: z.number(),
        blob_url: z.string().url(),
        patch: z.string().optional(),
      }),
    )
    .optional(),
});
