export type EditorPreferencesRecord = {
	defaultFont?: string;
	animateNumbers?: boolean;
	ai?: {
		semanticProvider?: "google" | "ollama";
		semanticModel?: string;
		semanticOllamaUrl?: string;
	};
};
