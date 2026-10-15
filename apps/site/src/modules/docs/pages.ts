import { repoUrl } from "@/data/content";

export type DocPage = {
  slug: string;
  title: string;
  metaTitle: string;
  kicker: string;
  description: string;
  source: string;
  outlineLabels?: boolean;
};

export const docBranch = "daddy";

export const docPages: DocPage[] = [
  {
    slug: "features",
    title: "Features",
    metaTitle: "Features: local-first notes, journal, tasks, search and sync",
    kicker: "Every feature",
    description:
      "The complete surface of Skriuw: the editor, journal, tasks, search, history, import and export, sync, AI, and the mobile app.",
    source: "docs/FEATURES.md",
    outlineLabels: true,
  },
  {
    slug: "architecture",
    title: "Architecture",
    metaTitle: "Architecture: Rust core, SQLite storage and the operation pipeline",
    kicker: "How it is built",
    description:
      "The Rust domain layer, SQLite as canonical storage, the operation pipeline, and the boundaries that keep navigation off the disk.",
    source: "docs/ARCHITECTURE.md",
  },
  {
    slug: "performance-contract",
    title: "Performance contract",
    metaTitle: "Performance contract: the interaction budgets Skriuw is held to",
    kicker: "What we promise",
    description:
      "The interaction budgets Skriuw is held to, how each one is measured, and what happens to a change that breaks them.",
    source: "docs/performance-contract.md",
  },
];

export function findDocPage(slug: string) {
  return docPages.find((page) => page.slug === slug);
}

export function docHref(page: DocPage) {
  return `/docs/${page.slug}/`;
}

export function docSourceUrl(page: DocPage) {
  return `${repoUrl}/blob/${docBranch}/${page.source}`;
}
