import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_SCENES } from "@/features/demo/scenes";
import { areDemoRoutesEnabled } from "@/features/demo/enabled";

export default function DemoIndexPage() {
	if (!areDemoRoutesEnabled()) notFound();

	return (
		<main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
			<div>
				<h1 className="text-2xl font-semibold text-foreground">Docs recording stages</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Each stage mounts the real editor with fake data on a 1280×720 frame, counts
					down from three, then plays itself. Start your screen recorder, hit Play, and
					crop to the frame.
				</p>
			</div>

			<ul className="flex flex-col gap-3">
				{DEMO_SCENES.map((scene) => (
					<li key={scene.slug}>
						<Link
							href={`/demo/${scene.slug}`}
							className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 hover:bg-muted"
						>
							<span className="font-medium text-foreground">{scene.title}</span>
							<span className="text-sm text-muted-foreground">
								{scene.description}
							</span>
							<code className="mt-1 text-xs text-muted-foreground">
								/demo/{scene.slug}
							</code>
						</Link>
					</li>
				))}
			</ul>

			<p className="text-xs text-muted-foreground">
				Add <code>?autoplay=1</code> to start on load, and <code>&loop=1</code> to replay on
				a cycle.
			</p>
		</main>
	);
}
