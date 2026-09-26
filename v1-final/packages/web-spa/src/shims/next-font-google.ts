type FontOptions = {
	subsets?: string[];
	display?: string;
	weight?: string | string[];
	preload?: boolean;
	variable?: string;
};

type FontResult = {
	className: string;
	variable: string;
	style: { fontFamily: string };
};

/**
 * Maps Next's `next/font/google` loaders onto static CSS classes defined in
 * `src/styles/fonts.css`. Each loader returns the CSS-variable class derived
 * from the requested `variable` name; the actual @font-face / family binding
 * lives in fonts.css, keyed by that same variable.
 */
function createLoader(family: string) {
	return function load(options: FontOptions = {}): FontResult {
		const variableClass = options.variable
			? `fontvar-${options.variable.replace(/^--/, "")}`
			: "";
		return {
			className: variableClass,
			variable: variableClass,
			style: { fontFamily: family },
		};
	};
}

export const Inter = createLoader("Inter");
export const Lora = createLoader("Lora");
export const Source_Serif_4 = createLoader("Source Serif 4");
export const Merriweather = createLoader("Merriweather");
export const Libre_Baskerville = createLoader("Libre Baskerville");
export const JetBrains_Mono = createLoader("JetBrains Mono");
export const Fira_Code = createLoader("Fira Code");
