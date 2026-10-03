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
    "Install Skriuw with Homebrew, Scoop, APT, or dnf, or download a release asset directly. Free, open source, and usable without an account.",
  alternates: { canonical: "/download/" },
  openGraph: {
    title: "Install it. Keep your data.",
    description:
      "Native desktop builds for macOS, Windows, and Linux, plus a browser build running the same Rust core.",
    url: "https://skriuw.com/download/",
    images: [socialImage],
  },
};

const surfaces = [
  {
    term: "Desktop",
    title: "SQLite on disk",
    body: "Native storage, local images, automatic Git history, backups, and OS integration.",
  },
  {
    term: "Browser",
    title: "SQLite through WebAssembly",
    body: "The same core stores the workspace in the browser through OPFS. No demo shell.",
  },
  {
    term: "Both",
    title: "Sync stays optional",
    body: "Start without an account. Sign in only if you want the same workspace elsewhere.",
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
        eyebrow="Free · open source · no account required"
        title="Install it. Keep your data."
        lede="Skriuw runs natively on macOS, Windows, and Linux. The browser build uses the same Rust core and keeps its database in browser-local storage."
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
        lead="Use the package manager"
        trail="already on your machine."
        intro="Every desktop build stores the workspace locally in SQLite. Package-manager installs and direct release assets run the same application."
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
          each GitHub release. The AUR package can lag behind while upstream publication is paused;
          Winget and Snap are not current install channels.
        </Note>
      </PageSection>

      <PageSection
        index="02"
        label="One product"
        lead="Desktop when you want the filesystem."
        trail="Browser when you want a blank page now."
      >
        <TermGrid terms={surfaces} />
      </PageSection>

      <PageCta
        title="Pick a build. Your first note stays with you."
        body="Skriuw is free, open source, and usable without creating an account."
        actions={[
          { label: "View the latest release", href: releasesUrl },
          { label: "Read the storage boundary", href: "/local-first-notes/" },
        ]}
      />
    </>
  );
}
