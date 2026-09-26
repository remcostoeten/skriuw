export function loadMetadataPanel() {
	return import("./metadata-panel").then((module) => module.MetadataPanel);
}

export function preloadMetadataPanel() {
	void loadMetadataPanel();
}
