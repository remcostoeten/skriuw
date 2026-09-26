import type { Metadata } from "next";
import { CodeCard, PageCta, PageHero, PageSection, TermGrid } from "@/components/page/page-shell";
import { JsonLd } from "@/components/page/json-ld";
import { socialImage } from "@/data/seo";
import { appUrl, releasesUrl } from "@/data/content";

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

const channels = [
  {
    platform: "macOS",
    title: "Homebrew",
    body: "Install the signed desktop application through a dedicated cask.",
    lines: ["$ brew install --cask skriuw/tap/skriuw"],
  },
  {
    platform: "Windows",
    title: "Scoop",
    body: "Add the Skriuw bucket once, then install and update from the terminal.",
    lines: [
      "> scoop bucket add skriuw https://github.com/skriuw/scoop-bucket",
      "> scoop install skriuw",
    ],
  },
  {
    platform: "Debian / Ubuntu",
    title: "APT",
    body: "The repository publishes signed packages for Debian-family systems.",
    lines: [
      "$ curl -fsSL https://skriuw.github.io/packages/apt/key.gpg \\",
      "  | sudo gpg --dearmor -o /usr/share/keyrings/skriuw.gpg",
      '$ echo "deb [signed-by=/usr/share/keyrings/skriuw.gpg] \\',
      '  https://skriuw.github.io/packages/apt stable main" \\',
      "  | sudo tee /etc/apt/sources.list.d/skriuw.list",
      "$ sudo apt update && sudo apt install skriuw",
    ],
  },
  {
    platform: "Fedora / RHEL",
    title: "dnf",
    body: "Use the published RPM repository, or download an RPM directly.",
    lines: [
      "$ sudo dnf config-manager addrepo \\",
      "  --from-repofile=https://skriuw.github.io/packages/rpm/skriuw.repo",
      "$ sudo dnf install skriuw",
    ],
  },
];

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
        kicker="01 / Download"
        marks={["Native shell", "Local database", "Your filesystem"]}
        eyebrow="Free · open source · no account required"
        title="Install it. Keep your data."
        lede="Skriuw runs natively on macOS, Windows, and Linux. The browser build uses the same Rust core and keeps its database in browser-local storage."
        actions={[
          { label: "Get the latest desktop build", href: releasesUrl },
          { label: "Open the browser app", href: appUrl },
        ]}
      />

      <PageSection
        label="Install channels"
        lead="Use the package manager"
        trail="already on your machine."
        intro="Every desktop build stores the workspace locally in SQLite. Package-manager installs and direct release assets run the same application."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {channels.map((channel) => (
            <CodeCard key={channel.title} {...channel} />
          ))}
        </div>

        <p className="mt-8 rounded-card border border-clay-300 bg-clay-100 p-6 text-[15px] leading-[24px] text-ink-700">
          Direct <code className="font-mono text-[13px]">.dmg</code>,{" "}
          <code className="font-mono text-[13px]">.exe</code> /{" "}
          <code className="font-mono text-[13px]">.msi</code>,{" "}
          <code className="font-mono text-[13px]">.deb</code>,{" "}
          <code className="font-mono text-[13px]">.rpm</code>, and AppImage files are attached to
          each GitHub release. The AUR package can lag behind while upstream publication is paused;
          Winget and Snap are not current install channels.
        </p>
      </PageSection>

      <PageSection
        label="One product"
        lead="Desktop when you want the filesystem."
        trail="Browser when you want a blank page now."
        tinted
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
