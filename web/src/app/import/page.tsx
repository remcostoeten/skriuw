import type { Metadata } from "next";
import { CardGrid, PageCta, PageHero, PageSection, Steps } from "@/components/page/page-shell";
import { JsonLd } from "@/components/page/json-ld";
import { socialImage } from "@/data/seo";
import { repoUrl } from "@/data/content";

export const metadata: Metadata = {
  title: "Import from Obsidian, Notion, Bear and Apple Notes",
  description:
    "Skriuw scans local exports and previews every note, folder, property, image, and warning before anything enters your workspace.",
  alternates: { canonical: "/import/" },
  openGraph: {
    title: "Bring the archive. Inspect it before it moves.",
    description:
      "A preview-plan-apply import for Obsidian, Notion, Bear, Apple Notes, Evernote, Joplin, Simplenote, and plain files.",
    url: "https://skriuw.com/import/",
    images: [socialImage],
  },
};

const steps = [
  {
    index: "01 / Select",
    title: "Choose the local export",
    body: "Use a folder, individual files, ZIP, provider backup, or JSON export. Skriuw detects the likely format without uploading it.",
  },
  {
    index: "02 / Inspect",
    title: "Read the plan",
    body: "Review counts, destination, detected format, re-import behavior, and every fidelity or safety warning.",
  },
  {
    index: "03 / Apply",
    title: "Commit once",
    body: "Confirmed notes, folders, tags, properties, images, and import receipts enter the workspace as one atomic operation.",
  },
];

const sources = [
  {
    tag: "Vault folder",
    title: "Obsidian",
    body: "Preserves the folder tree, supported frontmatter, unambiguous local image embeds, and wikilinks with a unique target. Alias and heading links stay exact source when conversion would lose meaning.",
  },
  {
    tag: "Markdown & CSV ZIP",
    title: "Notion",
    body: "Imports the downloaded ZIP directly, removes page UUID suffixes, turns database rows into notes, and maps CSV columns to typed properties.",
  },
  {
    tag: ".bear2bk / TextBundle",
    title: "Bear",
    body: "Reads Markdown, images, timestamps, and exported tags. Encrypted and trashed notes stay skipped and appear in the completion report.",
  },
  {
    tag: "Markdown files",
    title: "Apple Notes",
    body: "Uses Apple's official selected-note Markdown export. Collect the exported files in a folder; Skriuw does not access Apple's private Notes database.",
  },
  {
    tag: "ENEX",
    title: "Evernote",
    body: "Imports notebooks, checkboxes, code blocks, tables, and formatting. Encrypted content and embedded attachments become visible placeholders in the report.",
  },
  {
    tag: "RAW export folder",
    title: "Joplin",
    body: "Turns notebooks into nested folders and resolves links to exported resources. Use Joplin's RAW export rather than JEX.",
  },
  {
    tag: "notes.json",
    title: "Simplenote",
    body: "Imports active notes, tags, timestamps, and pins. Trashed notes remain skipped and counted.",
  },
  {
    tag: "Markdown / text / ZIP",
    title: "Plain files",
    body: "Bring ordinary files and folders without naming a provider. Skriuw also recognizes Google Keep Takeout, Standard Notes backups, and several structured export formats.",
  },
];

const fidelity = [
  {
    tag: "Links",
    title: "Only unique targets resolve",
    body: "Ambiguous wikilinks and image names remain source text instead of pointing to a guessed note or file.",
  },
  {
    tag: "Unsupported syntax",
    title: "Preserved in raw mode",
    body: "Markdown that the structured editor cannot represent safely stays intact in raw mode. The import report tells you what was preserved.",
  },
  {
    tag: "Remote content",
    title: "Blocked by default",
    body: "Remote images remain blocked. Local images transfer through a bounded, cancellable path and are verified before the import commits.",
  },
  {
    tag: "Re-import",
    title: "Durable receipts",
    body: "Durable receipts let a later import skip previous matches, update imported content, or create deliberate copies.",
  },
];

const importGuideUrl = `${repoUrl}/blob/daddy/docs/provider-import.md`;

export default function ImportPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Import into Skriuw",
          url: "https://skriuw.com/import/",
          description:
            "How Skriuw previews, plans, and atomically applies imports from other notes applications.",
          isPartOf: { "@id": "https://skriuw.com/#website" },
          about: { "@type": "SoftwareApplication", name: "Skriuw" },
        }}
      />

      <PageHero
        kicker="04 / Import"
        marks={["Local source", "Previewed plan", "Atomic commit"]}
        eyebrow="Obsidian · Notion · Bear · Apple Notes · and more"
        title="Bring the archive. Inspect it before it moves."
        lede="Skriuw scans local exports and shows the notes, folders, properties, images, and warnings it found. Nothing enters your workspace until you approve the plan."
        actions={[
          { label: "Download the desktop app", href: "/download/" },
          { label: "Read the complete import guide", href: importGuideUrl },
        ]}
      />

      <PageSection
        label="The import path"
        lead="A migration should explain itself"
        trail="before it changes the archive."
        intro="Import is a preview-plan-apply operation. Cancelling during intake, preview, or image transfer leaves the workspace unchanged."
      >
        <Steps steps={steps} />
      </PageSection>

      <PageSection
        label="Supported sources"
        lead="Use the export"
        trail="your current app already gives you."
        intro="Skriuw reads documented export formats and ordinary local files. It does not log in to another notes service or read a private application database."
        tinted
      >
        <CardGrid columns={4} items={sources} />
      </PageSection>

      <PageSection
        label="Fidelity over guesses"
        lead="Ambiguous content remains"
        trail="visible, portable source."
      >
        <CardGrid columns={4} items={fidelity} />
        <p className="mt-8 rounded-card border border-clay-300 bg-clay-100 p-6 text-[15px] leading-[24px] text-ink-700">
          Archives reject absolute paths, parent traversal, symlinks, duplicate case-insensitive
          paths, excessive depth, excessive entry counts, and expanded data beyond bounded safety
          limits.
        </p>
      </PageSection>

      <PageCta
        title="Your old archive should arrive with a receipt, not a leap of faith."
        body="Install Skriuw, open the command palette, and choose an import. The preview comes first."
        actions={[
          { label: "Download Skriuw", href: "/download/" },
          { label: "Open the import guide", href: importGuideUrl },
        ]}
      />
    </>
  );
}
