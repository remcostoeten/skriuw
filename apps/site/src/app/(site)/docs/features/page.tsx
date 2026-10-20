import Link from "next/link";
import { outlineButton } from "@/components/frame/control";
import { DocHeader, DocNeighbours } from "@/modules/docs/doc-article";
import { FeatureOverview } from "@/modules/docs/feature-overview";
import { docHref, docPages, featureDetailPage, featuresPage } from "@/modules/docs/pages";
import { renderDoc } from "@/modules/docs/render-doc";
import { docMetadata, docSchema } from "@/data/seo";
import { JsonLd } from "@/components/page/json-ld";

export const metadata = docMetadata(featuresPage);

export default async function FeaturesPage() {
  const { sections, lede } = await renderDoc(featuresPage);
  const next = docPages[docPages.indexOf(featuresPage) + 1];
  const detailHref = docHref(featureDetailPage);

  return (
    <>
      <JsonLd data={docSchema(featuresPage)} />
      <DocHeader
        page={featuresPage}
        lede={lede}
        crumbs={[{ label: "Documentation", href: "/docs/" }]}
        actions={
          <Link href={detailHref} className={outlineButton}>
            {featureDetailPage.title}
            <span aria-hidden>→</span>
          </Link>
        }
      />
      <FeatureOverview sections={sections} href={detailHref} />
      <DocNeighbours next={next && { title: next.title, href: docHref(next) }} />
    </>
  );
}
