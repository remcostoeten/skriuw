import { loadActiveSeedBundle } from "@/features/admin/seed/server/queries";
import { SeedEditorPage } from "@/features/admin/seed/components/seed-editor-page";

export default async function AdminSeedPage() {
	const bundle = await loadActiveSeedBundle();

	if (!bundle) {
		return (
			<section className="mx-auto flex max-w-2xl flex-col gap-3 px-8 py-12">
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">No active bundle</h1>
				<p className="text-sm leading-6 text-muted-foreground/85">
					No seed bundle is currently marked active. Run the migration or insert a row manually.
				</p>
			</section>
		);
	}

	return (
		<SeedEditorPage
			bundleId={bundle.id}
			bundleName={bundle.name}
			payload={bundle.payload}
		/>
	);
}
