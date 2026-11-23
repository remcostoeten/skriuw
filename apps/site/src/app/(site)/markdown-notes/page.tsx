import type { Metadata } from "next";
import { CardGrid, PageCta, PageHero, PageSection, TermGrid } from "@/components/page/page-shell";
import { JsonLd } from "@/components/page/json-ld";
import { socialImage } from "@/data/seo";
import { appUrl } from "@/data/content";

export const metadata: Metadata = {
  title: "Markdown Notes App",
  description:
    "Skriuw is a Markdown notes app with a rich text editor and a raw Markdown view. Notes export as plain Markdown, and wikilinks keep working after a note is renamed.",
  alternates: { canonical: "/markdown-notes/" },
  openGraph: {
    siteName: "Skriuw",
    title: "Markdown notes with a rich text editor and a raw view",
    description:
      "Markdown shortcuts turn into formatting as you type, the raw view shows the source, and exported files open in other editors.",
    url: "https://skriuw.com/markdown-notes/",
    images: [socialImage],
  },
};

const rawSample = `# Field notes

Folders decide where a note lives.
Links decide what it is about.

## Keep the useful parts

- Link to [[Reading list]]
- Tag the idea with #reference
- [ ] Revisit the source

\`\`\`rust
let notes = local_first();
\`\`\``;

const surface = [
  {
    tag: "Blocks and marks",
    title: "Formatting options",
    body: "Six heading levels, quotes, tables, fenced code, bullet, numbered and collapsible lists, checklists, alignment, underline and highlight colors.",
  },
  {
    tag: "Paste",
    title: "Pasted Markdown renders",
    body: "Pasted Markdown appears as headings, lists, tables and code. Rich HTML from a web page pastes as formatted text. Raw mode keeps pasted text as source.",
  },
  {
    tag: "Links and references",
    title: "Links survive renames",
    body: "Wikilinks export as [[title]]. Inside the workspace, tags, people, backlinks and note links are stored by ID, so renaming a note doesn't break them.",
  },
  {
    tag: "Large notes",
    title: "Notes with thousands of blocks",
    body: "The editor renders a window of 192 blocks. Select all, copy, search, undo and accessibility navigation still cover the whole document.",
  },
];

const portability = [
  {
    term: "Export",
    title: "Plain Markdown files",
    body: "Export one note or the whole workspace as Markdown, with images in an images/ directory.",
  },
  {
    term: "Links",
    title: "Link labels update after renames",
    body: "Internal links point to note IDs, so they keep working after a rename. Exported labels change to the new title.",
  },
  {
    term: "Source",
    title: "Ambiguous links stay as source",
    body: "Ambiguous links and unsupported syntax stay as source text instead of being converted by guess.",
  },
];

export default function MarkdownNotesPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Markdown notes",
          url: "https://skriuw.com/markdown-notes/",
          description:
            "How Skriuw pairs a structured editor with readable Markdown source and portable exports.",
          isPartOf: { "@id": "https://skriuw.com/#website" },
          about: { "@type": "SoftwareApplication", name: "Skriuw" },
        }}
      />

      <PageHero
        index="03"
        label="markdown"
        marks={["Readable source", "Structured editor", "Portable archive"]}
        eyebrow="Rich text editor and raw Markdown view"
        title="Write in rich text or raw Markdown."
        lede="Markdown shortcuts like # and - turn into headings and lists as you type. The raw view shows the Markdown source of the same note."
        actions={[
          { label: "Try the Markdown editor", href: appUrl },
          { label: "Import existing Markdown", href: "/import/" },
        ]}
      />

      <PageSection
        index="01"
        label="One note, two views"
        lead="Edit the rendered note"
        trail="or its Markdown source."
        intro="Markdown shortcuts turn into structure as you type. The raw view shows the Markdown source with optional line numbers, word count, cursor row and column, and jump-to-row."
      >
        <div className="grid divide-y divide-dashed divide-line rounded-[10px] border border-line bg-hy-card lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="min-w-0 p-6">
            <span className="caps text-ink-400">Raw Markdown</span>
            <pre className="mt-5 overflow-x-auto rounded-md border border-line bg-hy-bg p-4 font-mono text-[12.5px] leading-[21px] text-ink-700">
              <code>{rawSample}</code>
            </pre>
          </div>

          <div className="min-w-0 p-6">
            <span className="caps text-ink-400">Structured editor</span>
            <div className="mt-5">
              <h3 className="font-serif text-[26px] leading-[32px] font-normal tracking-[-0.5px] text-ink-900">
                Field notes
              </h3>
              <p className="mt-3 text-[15px] leading-[24px] text-ink-500">
                Folders decide where a note lives. Links decide what it is about.
              </p>
              <h4 className="mt-6 text-[17px] font-medium text-ink-900">Keep the useful parts</h4>
              <ul className="mt-3 space-y-2 text-[15px] leading-[24px] text-ink-500">
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-ink-300" />
                  <span>
                    Link to{" "}
                    <span className="text-ink-900 underline decoration-ink-300">Reading list</span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-ink-300" />
                  <span>
                    Tag the idea with{" "}
                    <span className="font-mono text-[13px] text-accent">#reference</span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-1.5 size-3.5 shrink-0 rounded-[3px] border border-ink-300"
                  />
                  <span>Revisit the source</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection
        index="02"
        label="Editor features"
        lead="Headings, lists, tables and code"
        trail="work as you type."
      >
        <CardGrid columns={4} items={surface} />
      </PageSection>

      <PageSection
        index="03"
        label="Portability"
        lead="Markdown Skriuw can't convert"
        trail="stays as source text."
        intro="When the structured editor can't represent some Markdown safely, Skriuw keeps the exact source in raw mode. Frontmatter and footnotes stay as source text until the structured editor supports them."
      >
        <TermGrid terms={portability} />
      </PageSection>

      <PageCta
        title="Try the editor without an account."
        body="The full editor runs locally in your browser."
        actions={[
          { label: "Open the editor", href: appUrl },
          { label: "Install for desktop", href: "/download/" },
        ]}
      />
    </>
  );
}
