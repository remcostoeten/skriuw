import type { Metadata } from "next";
import { CardGrid, PageCta, PageHero, PageSection, TermGrid } from "@/components/page/page-shell";
import { JsonLd } from "@/components/page/json-ld";
import { socialImage } from "@/data/seo";
import { appUrl } from "@/data/content";

export const metadata: Metadata = {
  title: "Markdown Notes App",
  description:
    "Write in a structured editor or drop into raw Markdown. Skriuw keeps readable source, portable exports, and wikilinks that survive renames.",
  alternates: { canonical: "/markdown-notes/" },
  openGraph: {
    title: "Markdown when you want it. A real editor when you don't.",
    description:
      "Markdown input rules while you type, raw source when precision matters, and exports that stay readable elsewhere.",
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
    title: "Structure without ceremony",
    body: "Six heading levels, quotes, tables, fenced code, bullets, numbered and collapsible lists, checklists, alignment, underline, and restrained highlights.",
  },
  {
    tag: "Paste",
    title: "Arrives already rendered",
    body: "Paste Markdown and it arrives rendered. Paste rich HTML and it keeps useful formatting. Raw mode leaves source untouched.",
  },
  {
    tag: "Links and references",
    title: "Connected by stable identity",
    body: "Wikilinks export as [[title]]. Tags, people, backlinks, and note relationships stay connected by stable identity inside the workspace.",
  },
  {
    tag: "Large notes",
    title: "Thousands of blocks stay responsive",
    body: "A bounded editor window keeps thousands of blocks responsive while search, copy, undo, and accessibility still cover the complete document.",
  },
];

const portability = [
  {
    term: "Export",
    title: "Readable files and folders",
    body: "Export one note or the full workspace with images kept beside the Markdown.",
  },
  {
    term: "Links",
    title: "Labels follow renames",
    body: "Stable identities keep internal links intact; exported labels refresh when titles change.",
  },
  {
    term: "Source",
    title: "Ambiguity stays visible",
    body: "Unresolved links and syntax remain source text instead of becoming a guessed conversion.",
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
        kicker="03 / Markdown"
        marks={["Readable source", "Structured editor", "Portable archive"]}
        eyebrow="Rich when writing · raw when precision matters"
        title="Markdown when you want it. A real editor when you don't."
        lede="Type headings, lists, code, and links naturally. Drop into the source when exact syntax matters. Both views edit the same note."
        actions={[
          { label: "Try the Markdown editor", href: appUrl },
          { label: "Bring existing Markdown", href: "/import/" },
        ]}
      />

      <PageSection
        label="One note, two views"
        lead="The source stays close"
        trail="without sitting between you and every sentence."
        intro="Markdown input rules turn familiar punctuation into structure as you type. Raw mode exposes the underlying text with line numbers, position, counts, and synchronized scrolling."
      >
        <div className="grid gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-2">
          <div className="bg-surface p-7">
            <span className="font-mono text-[12px] tracking-[0.06em] text-ink-400 uppercase">
              Raw Markdown
            </span>
            <pre className="mt-5 overflow-x-auto font-mono text-[13px] leading-[22px] text-ink-700">
              <code>{rawSample}</code>
            </pre>
          </div>

          <div className="bg-surface p-7">
            <span className="font-mono text-[12px] tracking-[0.06em] text-ink-400 uppercase">
              Structured editor
            </span>
            <div className="mt-5">
              <h3 className="text-[22px] font-medium text-ink-900">Field notes</h3>
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
                    <span className="font-mono text-[13px] text-clay-500">#reference</span>
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
        label="Writing surface"
        lead="Enough structure for serious notes."
        trail="No schema ceremony before the first line."
        tinted
      >
        <CardGrid columns={4} items={surface} />
      </PageSection>

      <PageSection
        label="Portability"
        lead="Unsupported does not mean discarded."
        intro="When Skriuw cannot represent Markdown safely in the structured editor, it preserves the exact source in raw mode. Frontmatter and footnotes remain source text until they have a lossless structured representation."
      >
        <TermGrid terms={portability} />
      </PageSection>

      <PageCta
        title="Write the note first. Inspect the syntax when it earns your attention."
        body="The full editor runs locally in your browser, with no account required."
        actions={[
          { label: "Open the editor", href: appUrl },
          { label: "Install for desktop", href: "/download/" },
        ]}
      />
    </>
  );
}
