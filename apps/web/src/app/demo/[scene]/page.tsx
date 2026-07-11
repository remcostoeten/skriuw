import { notFound } from "next/navigation";
import { DemoStageClient } from "@/features/demo/components/demo-stage-client";
import { DEMO_SCENES, findScene } from "@/features/demo/scenes";
import { areDemoRoutesEnabled } from "@/features/demo/enabled";

type Props = {
	params: Promise<{ scene: string }>;
};

export function generateStaticParams() {
	return DEMO_SCENES.map((scene) => ({ scene: scene.slug }));
}

export default async function DemoScenePage({ params }: Props) {
	if (!areDemoRoutesEnabled()) notFound();

	const { scene: slug } = await params;
	const scene = findScene(slug);
	if (!scene) notFound();

	return <DemoStageClient slug={scene.slug} />;
}
