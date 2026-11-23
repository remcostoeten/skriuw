import type { Metadata } from "next";
import {
  CodeCard,
  PageCta,
  PageHero,
  PageSection,
  TermGrid,
  Note,
} from "@/components/page/page-shell";
import { JsonLd } from "@/components/page/json-ld";
import { socialImage } from "@/data/seo";
import { DetectedMark, DownloadButton } from "@/components/download/download-button";
import { primaryButton } from "@/components/frame/control";
import { appUrl, releasesUrl } from "@/data/content";
import { packageChannels } from "@/data/downloads";

export const metadata: Metadata = {
  title: "Download for macOS, Windows and Linux",
  description:
    "Install Skriuw with Homebrew, Scoop, APT or dnf, or download a release file directly. Free, open source and usable without an account.",
  alternates: { canonical: "/download/" },
  openGraph: {
    siteName: "Skriuw",
    title: "Download Skriuw for macOS, Windows and Linux",
    description:
      "Desktop apps for macOS, Windows and Linux, plus a browser app that runs the same Rust core.",
    url: "https://skriuw.com/download/",
    images: [socialImage],
  },
};

const surfaces = [
  {
    term: "Desktop",
    title: "SQLite on disk",
    body: "Stores the workspace in SQLite on disk, with local image files. Git history and verified backups run in the background.",
  },
  {
    term: "Browser",
    title: "SQLite through WebAssembly",
    body: "The same Rust core runs as WebAssembly and stores the workspace in the browser's private file system (OPFS).",
  },
  {
    term: "Both",
    title: "Sync is optional",
    body: "Both work without an account. Sign in only to sync the workspace to another device.",
  },
];

export default function DownloadPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Skriuw",
          applicationCategory: "Productivity",
          operatingSystem: "macOS, Windows, Linux, Web",
          url: "https://skriuw.com/download/",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          isPartOf: { "@id": "https://skriuw.com/#website" },
        }}
      />

      <PageHero
        index="01"
        label="download"
        marks={["Native shell", "Local database", "Your filesystem"]}
        eyebrow="Free, open source, no account required"
        title="Download Skriuw."
        lede="Skriuw runs natively on macOS, Windows and Linux. The browser build uses the same Rust core and stores its database in the browser's private file storage."
        leadAction={
          <DownloadButton
            className={primaryButton}
            fallbackLabel="Download for desktop"
            fallbackHref={releasesUrl}
          />
        }
        actions={[{ label: "Open the browser app", href: appUrl }]}
      />

      <PageSection
        index="01"
        label="Install channels"
        lead="Install with a package manager"
        trail="or download a release file."
        intro="Every desktop build stores the workspace locally in SQLite. Package manager installs and direct release assets run the same application."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {packageChannels.map(({ os, anchor, ...channel }) => (
            <CodeCard
              key={channel.title}
              id={anchor}
              mark={<DetectedMark os={os} />}
              {...channel}
            />
          ))}
        </div>

        <Note className="mt-4">
          Direct <code className="font-mono text-[13px]">.dmg</code>,{" "}
          <code className="font-mono text-[13px]">.exe</code> /{" "}
          <code className="font-mono text-[13px]">.msi</code>,{" "}
          <code className="font-mono text-[13px]">.deb</code>,{" "}
          <code className="font-mono text-[13px]">.rpm</code>, and AppImage files are attached to
          each GitHub release. The AUR package can lag behind the latest release because upstream
          publication is paused. Winget and Snap are not current install channels.
        </Note>
      </PageSection>

      <PageSection
        index="02"
        label="Desktop and browser"
        lead="The desktop app stores data on disk,"
        trail="the browser app stores it in the browser."
      >
        <TermGrid terms={surfaces} />
      </PageSection>

      <PageCta
        title="Install Skriuw for free."
        body="Skriuw is open source and works without an account."
        actions={[
          { label: "View the latest release", href: releasesUrl },
          { label: "How Skriuw stores notes", href: "/local-first-notes/" },
        ]}
      />
    </>
  );
}
