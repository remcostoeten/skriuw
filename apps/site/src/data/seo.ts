import type { Metadata } from "next";
import type { DocPage } from "@/modules/docs/pages";

export const siteUrl = "https://skriuw.com";

export const socialImage = {
  url: `${siteUrl}/og-image.png`,
  width: 1200,
  height: 630,
  alt: "Skriuw: a local-first writing workspace",
};

export const homeSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: "Skriuw",
      url: `${siteUrl}/`,
      description: "A local-first workspace for writing, journaling, and connected knowledge.",
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Skriuw",
      url: `${siteUrl}/`,
      logo: { "@type": "ImageObject", url: `${siteUrl}/app-icon.png` },
    },
    {
      "@type": "SoftwareApplication",
      name: "Skriuw",
      url: `${siteUrl}/`,
      description: "A local-first notes app for writing, journaling, and connected knowledge.",
      image: socialImage.url,
      applicationCategory: "Productivity",
      operatingSystem: "macOS, Windows, Linux, Web",
      downloadUrl: `${siteUrl}/download/`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

/**
 * @name docMetadata
 * @description Builds the metadata for a page rendered from a repository
 * document: its title, description, canonical path and Open Graph card.
 *
 * @example
 * export const metadata = docMetadata(featuresPage);
 */
export function docMetadata(page: DocPage): Metadata {
  const path = `/docs/${page.slug}/`;

  return {
    title: page.metaTitle,
    description: page.description,
    alternates: { canonical: path },
    openGraph: {
      siteName: "Skriuw",
      title: `${page.title} | Skriuw`,
      description: page.description,
      url: `${siteUrl}${path}`,
      images: [socialImage],
    },
  };
}

export type DocSchemaOptions = {
  section?: { name: string; path: string };
  datePublished?: string;
};

export function docSchema(page: DocPage, options: DocSchemaOptions = {}) {
  const url = `${siteUrl}/docs/${page.slug}/`;
  const crumbs = [
    { name: "Skriuw", item: `${siteUrl}/` },
    { name: "Documentation", item: `${siteUrl}/docs/` },
    ...(options.section
      ? [{ name: options.section.name, item: `${siteUrl}${options.section.path}` }]
      : []),
    { name: page.title, item: url },
  ];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${url}#article`,
        headline: page.title,
        description: page.description,
        url,
        image: socialImage.url,
        ...(options.datePublished ? { datePublished: options.datePublished } : {}),
        publisher: { "@id": `${siteUrl}/#organization` },
        isPartOf: { "@id": `${siteUrl}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          ...crumb,
        })),
      },
    ],
  };
}
