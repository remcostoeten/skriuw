import type { Metadata } from "next";
import {
  BoundaryLists,
  CardGrid,
  PageCta,
  PageHero,
  PageSection,
  TermGrid,
} from "@/components/page/page-shell";
import { JsonLd } from "@/components/page/json-ld";
import { socialImage } from "@/data/seo";
import { appUrl } from "@/data/content";

export const metadata: Metadata = {
  title: "Private, Local-First Notes App",
  description:
    "Skriuw is a private, local-first notes app with SQLite storage, no required account, no telemetry, portable Markdown, and opt-in sync.",
  alternates: { canonical: "/local-first-notes/" },
  openGraph: {
    title: "A private, local-first notes app",
    description:
      "Write without an account. Keep your workspace in local SQLite. Turn on sync only when you choose.",
    url: "https://skriuw.com/local-first-notes/",
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    images: [socialImage],
    title: "Skriuw: private, local-first notes",
    description:
      "No required account, no telemetry, local SQLite storage, and sync that stays off until you choose it.",
  },
};

const capabilities = [
  {
    tag: "Write and navigate",
    title: "Nothing loads before you type",
    body: "Notes are already present in memory. Typing and switching notes give immediate local feedback instead of waiting on disk, IPC, or a network response.",
  },
  {
    tag: "Store",
    title: "SQLite is the canonical workspace",
    body: "Images are content-addressed local files rather than remote placeholders or inflated document data.",
  },
  {
    tag: "Recover",
    title: "More than one way back",
    body: "Verified backups, trash recovery, portable workspace archives, and background Git history give mistakes more than one way back.",
  },
  {
    tag: "Leave",
    title: "Export without a converter",
    body: "Export a note or the whole workspace as Markdown. Links, images, and readable source remain useful outside Skriuw.",
  },
];

const durability = [
  {
    term: "Notes",
    title: "Plain Markdown out",
    body: "Single notes and whole workspaces export to files you can open elsewhere.",
  },
  {
    term: "Workspace",
    title: "Versioned archives",
    body: "Portable archives carry structured workspace state and remain compatibility-tested.",
  },
  {
    term: "History",
    title: "Git off the writing path",
    body: "Background versions protect the archive without slowing the editor.",
  },
];

export default function LocalFirstNotesPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Private, local-first notes",
          url: "https://skriuw.com/local-first-notes/",
          description: "How Skriuw stores, protects, and optionally syncs a local-first workspace.",
          isPartOf: { "@id": "https://skriuw.com/#website" },
          about: { "@type": "SoftwareApplication", name: "Skriuw" },
        }}
      />

      <PageHero
        index="02"
        label="local-first"
        marks={["Write locally", "Recover locally", "Choose the network"]}
        eyebrow="Private by default, explicit by design"
        title="A notes app that starts on your machine."
        lede="Open Skriuw and write. No account gate, no cloud round-trip, no telemetry. The workspace is local first; every network feature waits for your decision."
        actions={[
          { label: "Write in the browser", href: appUrl },
          { label: "Install the desktop app", href: "/download/" },
        ]}
      />

      <PageSection
        index="01"
        label="What local means"
        lead="The page does not wait for a server"
        trail="to agree that it exists."
        intro="Desktop workspaces live in SQLite on disk. Browser workspaces use the same Rust core compiled to WebAssembly and store SQLite through the browser's private filesystem."
      >
        <CardGrid columns={4} items={capabilities} />
      </PageSection>

      <PageSection
        index="02"
        label="The boundary"
        lead="Nothing crosses the network"
        trail="because a setting was easy to miss."
        intro="Skriuw has network features. It does not disguise them as local features. Sync, remote AI, and update checks each have a visible boundary."
      >
        <BoundaryLists
          columns={[
            {
              title: "Before you opt in",
              items: [
                "No account is required",
                "No analytics or telemetry are sent",
                "Sync is off",
                "AI tools are off and hidden",
                "Your notes stay on this device",
              ],
            },
            {
              title: "If you choose the network",
              items: [
                "Signing in can enable multi-device sync",
                "Sync is encrypted in transit, not end-to-end",
                "Remote AI uses only the provider you configure",
                "Local Ollama keeps prompts on your machine",
                "You can return to a local-only workflow",
              ],
            },
          ]}
          note="The sync server can read content stored through sync because end-to-end encryption is not implemented yet. If that boundary does not fit your work, keep sync off; the local application remains fully usable."
        />
      </PageSection>

      <PageSection
        index="03"
        label="Durability"
        lead="Local should not mean"
        trail="trapped in one database."
      >
        <TermGrid terms={durability} />
      </PageSection>

      <PageCta
        title="Start with one device. Add nothing you do not need."
        body="The browser app and desktop app both work without an account."
        actions={[
          { label: "Open a local workspace", href: appUrl },
          { label: "See how notes stay portable", href: "/markdown-notes/" },
        ]}
      />
    </>
  );
}
