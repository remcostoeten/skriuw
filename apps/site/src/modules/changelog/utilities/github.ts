import "server-only";

import type { z } from "zod";

export async function github<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const repository = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;

  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error("Invalid GITHUB_REPO");
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }

  return schema.parse(await response.json());
}
