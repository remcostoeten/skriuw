import { getReleases } from "@/modules/changelog/api/get-releases";
import { ReleasePill } from "@/modules/changelog/components/release-pill";
import { releaseHeadline } from "@/modules/changelog/release-headline";

async function loadLatest() {
  try {
    const [latest] = await getReleases();

    return latest ?? null;
  } catch (error) {
    console.error("Latest release lookup failed", error);

    return null;
  }
}

export async function LatestRelease() {
  const latest = await loadLatest();

  if (!latest) {
    return <ReleasePill />;
  }

  return <ReleasePill version={`v${latest.version}`} headline={releaseHeadline(latest.body)} />;
}
