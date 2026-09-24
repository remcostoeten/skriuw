"use server";

import { getComparison } from "../queries/get-comparison";
import { getReleases } from "../queries/get-releases";

export async function loadComparison(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return {
      ok: false as const,
      error: "Invalid release.",
    };
  }

  try {
    const releases = await getReleases();

    const index = releases.findIndex(function matches(release) {
      return release.id === id;
    });

    const release = releases[index];
    const previous = releases[index + 1];

    if (index < 0 || !release || !previous) {
      return {
        ok: false as const,
        error: "No preceding stable release is available.",
      };
    }

    const data = await getComparison(previous.tag, release.tag);

    return {
      ok: true as const,
      data,
    };
  } catch (error) {
    console.error("Release comparison failed", error);

    return {
      ok: false as const,
      error: "Could not load changes. Please try again.",
    };
  }
}
