import "server-only";

import { cacheLife } from "next/cache";

import { commitSchema, comparisonSchema } from "../../types/github";
import { github } from "../../utilities/github";

async function resolveTag(tag: string) {
  "use cache";

  cacheLife({
    stale: 300,
    revalidate: 300,
    expire: 3600,
  });

  const commit = await github(`/commits/${encodeURIComponent(tag)}`, commitSchema);

  return commit.sha;
}

async function compareShas(base: string, head: string) {
  "use cache";

  cacheLife({
    stale: 3600,
    revalidate: 86400,
    expire: 604800,
  });

  const comparison = await github(
    `/compare/${base}...${head}?per_page=100&page=1`,
    comparisonSchema,
  );

  const files = comparison.files ?? [];

  return {
    base,
    head,
    url: comparison.html_url,
    status: comparison.status,
    total: comparison.total_commits,
    commits: comparison.commits.map(function normalize(commit) {
      return {
        sha: commit.sha,
        url: commit.html_url,
        message: commit.commit.message.split("\n")[0],
      };
    }),
    files: files.map(function normalize(file, index) {
      const patch = index < 20 ? (file.patch?.slice(0, 12000) ?? null) : null;

      return {
        name: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        url: file.blob_url,
        patch,
        truncated: Boolean(patch && file.patch && patch.length < file.patch.length),
      };
    }),
    limited: comparison.total_commits > comparison.commits.length || files.length >= 300,
  };
}

export async function getComparison(base: string, head: string) {
  const [baseSha, headSha] = await Promise.all([resolveTag(base), resolveTag(head)]);

  return compareShas(baseSha, headSha);
}

export type Comparison = Awaited<ReturnType<typeof getComparison>>;
