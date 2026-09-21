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
      description:
        "A local-first workspace for writing, journaling, and connected knowledge.",
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
      applicationCategory: "Productivity",
      operatingSystem: "macOS, Windows, Linux, Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};
