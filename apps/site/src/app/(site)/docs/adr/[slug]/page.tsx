import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findAdr, listAdrs } from "@/modules/docs/adr";
import { AdrStatusLine } from "@/modules/docs/adr-status";
import { DocArticle } from "@/modules/docs/doc-article";
import { docHref } from "@/modules/docs/pages";
import { renderDoc } from "@/modules/docs/render-doc";
import { docSchema, socialImage } from "@/data/seo";
import { JsonLd } from "@/components/page/json-ld";

type Props = {
  params: Promise<{ slug: string }>;
};

const section = { name: "Decision records", path: "/docs/adr/" };

export async function generateStaticParams() {
  const records = await listAdrs();

  return records.map((record) => ({ slug: record.file }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const record = await findAdr(slug);

  if (!record) {
    return {};
  }

  return {
    title: record.metaTitle,
    description: record.description,
    alternates: { canonical: `/docs/${record.slug}/` },
    openGraph: {
      siteName: "Skriuw",
      type: "article",
      title: `${record.title} | Skriuw`,
      description: record.description,
      url: `https://skriuw.com/docs/${record.slug}/`,
      images: [socialImage],
      ...(record.date ? { publishedTime: record.date } : {}),
    },
  };
}

export default async function AdrPage({ params }: Props) {
  const { slug } = await params;
  const records = await listAdrs();
  const index = records.findIndex((record) => record.file === slug);
  const record = records[index];

  if (!record) {
    notFound();
  }

  const rendered = await renderDoc(record);
  const older = records[index + 1];
  const newer = records[index - 1];

  return (
    <>
      <JsonLd data={docSchema(record, { section, datePublished: record.date || undefined })} />
      <DocArticle
        page={record}
        rendered={rendered}
        crumbs={[
          { label: "Documentation", href: "/docs/" },
          { label: section.name, href: section.path },
        ]}
        meta={<AdrStatusLine status={record.status} date={record.date} />}
        previous={older && { title: `${older.kicker}: ${older.title}`, href: docHref(older) }}
        next={newer && { title: `${newer.kicker}: ${newer.title}`, href: docHref(newer) }}
      />
    </>
  );
}
