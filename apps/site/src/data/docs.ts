import { repoUrl } from "@/data/content";

export type DocPage = {
  slug: string;
  title: string;
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
    kicker: "Every feature",
    description:
      "The complete surface of Skriuw: the editor, journal, tasks, search, history, import and export, sync, AI, and the mobile app.",
    source: "docs/FEATURES.md",
    outlineLabels: true,
  },
  {
    slug: "architecture",
    title: "Architecture",
    kicker: "How it is built",
    description:
      "The Rust domain layer, SQLite as canonical storage, the operation pipeline, and the boundaries that keep navigation off the disk.",
    source: "docs/ARCHITECTURE.md",
  },
  {
    slug: "performance-contract",
    title: "Performance contract",
    kicker: "What we promise",
    description:
      "The interaction budgets Skriuw is held to, how each one is measured, and what happens to a change that breaks them.",
    source: "docs/performance-contract.md",
  },
  {
    slug: "changelog",
    title: "Changelog",
    kicker: "What changed",
    description:
      "Every released version of Skriuw, what it added, what it fixed, and where the v1 line ended and v2 picked it up.",
    source: "CHANGELOG.md",
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
