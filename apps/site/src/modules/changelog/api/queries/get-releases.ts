import "server-only";

import { cacheLife } from "next/cache";
import semver from "semver";
import { z } from "zod";

import { releaseSchema } from "../../types/github";
import { github } from "../../utilities/github";

const TAG_PREFIX = "v2-";

function stableVersion(tag: string) {
  if (!tag.startsWith(TAG_PREFIX)) {
    return null;
  }

  const version = semver.valid(tag.slice(TAG_PREFIX.length));

  return version && !semver.prerelease(version) ? version : null;
}

export async function getReleases() {
  "use cache";

  cacheLife({
    stale: 300,
    revalidate: 300,
    expire: 3600,
  });

  const releases = await github("/releases?per_page=100", z.array(releaseSchema));

  return releases
    .flatMap((release) => {
      const version = stableVersion(release.tag_name);

      if (release.draft || release.prerelease || !version) {
        return [];
      }

      return [
        {
          id: release.id,
          tag: release.tag_name,
          version,
          title: release.name || release.tag_name,
          body: release.body ?? "",
          url: release.html_url,
          date: release.published_at,
        },
      ];
    })
    .sort((a, b) => semver.rcompare(a.version, b.version));
}

export type Release = Awaited<ReturnType<typeof getReleases>>[number];
