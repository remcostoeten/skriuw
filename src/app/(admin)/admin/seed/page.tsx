export default function AdminSeedPage() {
	return (
		<section className="mx-auto flex max-w-2xl flex-col gap-3 px-8 py-12">
			<h1 className="text-2xl font-semibold tracking-tight text-foreground">
				Seed bundles
			</h1>
			<p className="text-sm leading-6 text-muted-foreground/85">
				The bundle authoring UI lands in a follow-up. New signups already read
				from the active <code>SeedBundle</code> row once one exists — until
				then, fresh accounts start with an empty workspace by design.
			</p>
		</section>
	);
}
