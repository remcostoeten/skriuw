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
    siteName: "Skriuw",
    title: "A private, local-first notes app",
    description:
      "Write without an account. Keep your workspace in local SQLite. Turn on sync only when you choose.",
    url: "https://skriuw.com/local-first-notes/",
    images: [socialImage],
  },
};

const capabilities = [
  {
    tag: "Write and navigate",
    title: "Notes are held in memory",
    body: "Typing and switching notes update the screen immediately. Neither waits for disk, IPC or the network.",
  },
  {
    tag: "Store",
    title: "SQLite stores your workspace",
    body: "SQLite is the source of truth for your notes. Images are local files named by their content hash, not remote links or data embedded in the note.",
  },
  {
    tag: "Recover",
    title: "Four ways to get a note back",
    body: "Skriuw keeps verified backups, a trash, portable workspace archives and Git history in the background.",
  },
  {
    tag: "Leave",
    title: "Export as Markdown",
    body: "Export one note or the whole workspace as Markdown. Links and images are included, and the files read fine in any text editor.",
  },
];

const durability = [
  {
    term: "Notes",
    title: "Markdown export",
    body: "You can export a single note or a whole workspace to files that open in other apps.",
  },
  {
    term: "Workspace",
    title: "Versioned archives",
    body: "Archives hold the structured workspace state. The format is versioned and tested for compatibility.",
  },
  {
    term: "History",
    title: "Git history in the background",
    body: "Skriuw records versions with Git in the background, so the editor never waits for it.",
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
        marks={["Notes in SQLite on disk", "Backups and trash recovery", "Sync is opt-in"]}
        eyebrow="No account, no telemetry"
        title="Notes stored on your device."
        lede="Skriuw keeps your notes in SQLite on your device. You don't need an account, it sends no telemetry, and sync and AI stay off until you turn them on."
        actions={[
          { label: "Write in the browser", href: appUrl },
          { label: "Install the desktop app", href: "/download/" },
        ]}
      />

      <PageSection
        index="01"
        label="What local means"
        lead="Notes load from your device"
        trail="not from a server."
        intro="Desktop workspaces live in SQLite on disk. Browser workspaces use the same Rust core compiled to WebAssembly and store SQLite in the browser's private filesystem."
      >
        <CardGrid columns={4} items={capabilities} />
      </PageSection>

      <PageSection
        index="02"
        label="The boundary"
        lead="What uses the network"
        intro="Skriuw has three features that use the network: sync, remote AI and update checks. The lists below show what is on before and after you opt in."
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
              title: "After you opt in",
              items: [
                "Signing in can enable multi-device sync",
                "Sync is end-to-end encrypted with a key from your recovery code",
                "Remote AI uses only the provider you configure",
                "Local Ollama keeps prompts on your machine",
                "You can switch back to local-only",
              ],
            },
          ]}
          note="The sync server stores your notes as encrypted bytes and sees only identifiers, sequences, sizes and timing. Public note links are different: shared text and images are stored on Skriuw's server without end-to-end encryption. If you lose the recovery code, you lose the cloud copy, not the notes on your devices."
        />
      </PageSection>

      <PageSection
        index="03"
        label="Durability"
        lead="Your notes aren't locked"
        trail="into one database."
      >
        <TermGrid terms={durability} />
      </PageSection>

      <PageCta
        title="Start writing without an account."
        body="The browser app and the desktop app both work without one."
        actions={[
          { label: "Open a local workspace", href: appUrl },
          { label: "How Markdown export works", href: "/markdown-notes/" },
        ]}
      />
    </>
  );
}
