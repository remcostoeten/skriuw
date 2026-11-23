import type { Metadata } from "next";
import {
  CardGrid,
  PageCta,
  PageHero,
  PageSection,
  Steps,
  Note,
} from "@/components/page/page-shell";
import { JsonLd } from "@/components/page/json-ld";
import { socialImage } from "@/data/seo";
import { repoUrl } from "@/data/content";

export const metadata: Metadata = {
  title: "Import from Obsidian, Notion, Bear and Apple Notes",
  description:
    "Skriuw scans local exports from Obsidian, Notion, Bear, Apple Notes and other apps. You see the detected format, destination, counts and warnings before anything changes in your workspace.",
  alternates: { canonical: "/import/" },
  openGraph: {
    siteName: "Skriuw",
    title: "Import notes from Obsidian, Notion, Bear and Apple Notes",
    description:
      "Preview the detected format, counts and warnings, then apply the import in one step. Works with exports from Obsidian, Notion, Bear, Apple Notes, Evernote, Joplin, Simplenote and plain files.",
    url: "https://skriuw.com/import/",
    images: [socialImage],
  },
};

const steps = [
  {
    index: "01 / Select",
    title: "Choose the local export",
    body: "Pick a folder, individual files, a ZIP, a provider backup or a JSON export. Skriuw detects the format on your device and uploads nothing.",
  },
  {
    index: "02 / Inspect",
    title: "Review the preview",
    body: "Check the counts, destination, detected format, re-import mode and any warnings.",
  },
  {
    index: "03 / Apply",
    title: "Apply the import",
    body: "Confirmed notes, folders, tags, properties, images and import receipts are saved in one atomic operation.",
  },
];

const sources = [
  {
    tag: "Vault folder",
    title: "Obsidian",
    body: "Keeps the folder tree, supported frontmatter, image embeds that match one file, and wikilinks that match one note. Alias and heading wikilinks stay as source text.",
  },
  {
    tag: "Markdown & CSV ZIP",
    title: "Notion",
    body: "Import the ZIP you download from Notion's Markdown & CSV export. Page UUID suffixes are removed, database rows become notes and CSV columns become typed properties.",
  },
  {
    tag: ".bear2bk / TextBundle",
    title: "Bear",
    body: "Reads Markdown, images, timestamps and exported tags. Encrypted and trashed notes are skipped and listed in the completion report.",
  },
  {
    tag: "Markdown files",
    title: "Apple Notes",
    body: "Export each note with File > Export as > Markdown in Apple Notes, put the files in one folder and import that folder. Skriuw doesn't read Apple's private Notes database.",
  },
  {
    tag: "ENEX",
    title: "Evernote",
    body: "Imports notebooks, checkboxes, code blocks, tables and formatting. Encrypted content and embedded attachments become placeholders listed in the report.",
  },
  {
    tag: "RAW export folder",
    title: "Joplin",
    body: "Notebooks become nested folders and links to exported resources are resolved. Use Joplin's RAW export, not JEX.",
  },
  {
    tag: "notes.json",
    title: "Simplenote",
    body: "Imports active notes, tags, timestamps and pins. Trashed notes are skipped and counted.",
  },
  {
    tag: "Markdown / text / ZIP",
    title: "Plain files",
    body: "Import ordinary files and folders without choosing a provider. Skriuw also reads Google Keep Takeout folders and decrypted Standard Notes backups.",
  },
];

const fidelity = [
  {
    tag: "Links",
    title: "Only unique targets resolve",
    body: "A wikilink or image name that matches more than one note or file stays as source text instead of pointing at a guess.",
  },
  {
    tag: "Unsupported syntax",
    title: "Preserved in raw mode",
    body: "Markdown the structured editor can't represent safely stays intact in raw mode. The import report lists unsupported attachments and unreadable files.",
  },
  {
    tag: "Remote content",
    title: "Remote images are blocked by default",
    body: "Remote images stay blocked unless you allow downloads. The first import that links https images asks once, and downloaded images are stored in the workspace. Local images transfer with cancellable progress.",
  },
  {
    tag: "Re-import",
    title: "Import receipts",
    body: "Receipts let a later import skip previous matches, update imported content or create copies.",
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
        index="04"
        label="import"
        marks={["Local source", "Previewed plan", "Atomic commit"]}
        eyebrow="Obsidian, Notion, Bear, Apple Notes and more"
        title="Import notes from other apps."
        lede="Skriuw scans a local export and shows the notes, folders, properties, images and warnings it found. Nothing enters your workspace until you approve the import."
        actions={[
          { label: "Download the desktop app", href: "/download/" },
          { label: "Read the import guide", href: importGuideUrl },
        ]}
      />

      <PageSection
        index="01"
        label="The import path"
        lead="You see the plan"
        trail="before anything changes."
        intro="An import has three steps: select, review, apply. Cancelling during intake, preview or image transfer leaves the workspace unchanged."
      >
        <Steps steps={steps} />
      </PageSection>

      <PageSection
        index="02"
        label="Supported sources"
        lead="Import the export"
        trail="your current app produces."
        intro="Skriuw reads documented export formats and ordinary local files. It does not log in to another notes service or read a private application database."
      >
        <CardGrid columns={4} items={sources} />
      </PageSection>

      <PageSection
        index="03"
        label="Fidelity"
        lead="Content Skriuw can't convert safely"
        trail="stays as source text."
      >
        <CardGrid columns={4} items={fidelity} />
        <Note className="mt-4">
          Skriuw rejects archives that contain absolute paths, parent traversal, symlinks, duplicate
          case-insensitive paths, excessive depth or entry counts, or more expanded data than the
          safety limits allow.
        </Note>
      </PageSection>

      <PageCta
        title="Preview an import before you apply it."
        body="Install Skriuw, open the command palette and choose an import command. Skriuw scans the source before it changes the workspace."
        actions={[
          { label: "Download Skriuw", href: "/download/" },
          { label: "Open the import guide", href: importGuideUrl },
        ]}
      />
    </>
  );
}
