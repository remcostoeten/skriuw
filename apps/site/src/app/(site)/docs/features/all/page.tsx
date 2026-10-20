import { DocArticle } from "@/modules/docs/doc-article";
import { docHref, docPages, featureDetailPage, featuresPage } from "@/modules/docs/pages";
import { renderDoc } from "@/modules/docs/render-doc";
import { docMetadata, docSchema } from "@/data/seo";
import { JsonLd } from "@/components/page/json-ld";

export const metadata = docMetadata(featureDetailPage);

const overview = { label: featuresPage.title, href: docHref(featuresPage) };

export default async function FeatureDetailPage() {
  const rendered = await renderDoc(featuresPage);
  const next = docPages[docPages.indexOf(featuresPage) + 1];

  return (
    <>
      <JsonLd
        data={docSchema(featureDetailPage, {
          section: { name: overview.label, path: overview.href },
        })}
      />
      <DocArticle
        page={featureDetailPage}
        rendered={rendered}
        crumbs={[{ label: "Documentation", href: "/docs/" }, overview]}
        previous={{ title: overview.label, href: overview.href }}
        next={next && { title: next.title, href: docHref(next) }}
      />
    </>
  );
}
