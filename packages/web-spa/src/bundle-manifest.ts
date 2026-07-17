export type ManifestChunk = {
	file: string;
	css?: string[];
	imports?: string[];
	dynamicImports?: string[];
	isEntry?: boolean;
};

export type ManifestGraph = {
	entryKey: string;
	staticKeys: string[];
	dynamicKeys: string[];
	staticCss: string[];
};

/** Traverses the entry's transitive static graph exactly once. */
export function collectManifestGraph(manifest: Record<string, ManifestChunk>): ManifestGraph {
	const entryKey = Object.keys(manifest).find((key) => manifest[key]?.isEntry);
	if (!entryKey) throw new Error("No application entry found in Vite manifest");

	const staticKeys = new Set<string>();
	const dynamicKeys = new Set<string>();

	function visitStatic(key: string) {
		if (staticKeys.has(key)) return;
		const chunk = manifest[key];
		if (!chunk) throw new Error(`Manifest import ${key} is missing`);
		staticKeys.add(key);
		for (const imported of chunk.imports ?? []) visitStatic(imported);
		for (const imported of chunk.dynamicImports ?? []) dynamicKeys.add(imported);
	}

	visitStatic(entryKey);

	return {
		entryKey,
		staticKeys: [...staticKeys],
		dynamicKeys: [...dynamicKeys],
		staticCss: [...new Set([...staticKeys].flatMap((key) => manifest[key]!.css ?? []))],
	};
}
