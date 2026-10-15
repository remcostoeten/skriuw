import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle } from "@/modules/docs/doc-article";
import { docHref, docPages, findDocPage } from "@/modules/docs/pages";
import { renderDoc } from "@/modules/docs/render-doc";
import { docSchema, socialImage } from "@/data/seo";
import { JsonLd } from "@/components/page/json-ld";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return docPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = findDocPage(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.metaTitle,
    description: page.description,
    alternates: { canonical: `/docs/${page.slug}/` },
    openGraph: {
      siteName: "Skriuw",
      title: `${page.title} | Skriuw`,
      description: page.description,
      url: `https://skriuw.com/docs/${page.slug}/`,
      images: [socialImage],
    },
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const page = findDocPage(slug);

  if (!page) {
    notFound();
  }

  const rendered = await renderDoc(page);
  const index = docPages.indexOf(page);
  const previous = docPages[index - 1];
  const next = docPages[index + 1];

  return (
    <>
      <JsonLd data={docSchema(page)} />
      <DocArticle
        page={page}
        rendered={rendered}
        crumbs={[{ label: "Documentation", href: "/docs/" }]}
        previous={previous && { title: previous.title, href: docHref(previous) }}
        next={next && { title: next.title, href: docHref(next) }}
      />
    </>
  );
}
