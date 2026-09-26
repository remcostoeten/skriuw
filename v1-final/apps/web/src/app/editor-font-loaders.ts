import {
	Fira_Code,
	Inter,
	JetBrains_Mono,
	Libre_Baskerville,
	Lora,
	Merriweather,
	Source_Serif_4,
} from "next/font/google";

const inter = Inter({
	subsets: ["latin"],
	display: "swap",
	preload: false,
	variable: "--font-editor-inter",
});

const lora = Lora({
	subsets: ["latin"],
	display: "swap",
	preload: false,
	variable: "--font-editor-lora",
});

const sourceSerif = Source_Serif_4({
	subsets: ["latin"],
	display: "swap",
	preload: false,
	variable: "--font-editor-source-serif",
});

const merriweather = Merriweather({
	subsets: ["latin"],
	display: "swap",
	preload: false,
	variable: "--font-editor-merriweather",
});

const libreBaskerville = Libre_Baskerville({
	subsets: ["latin"],
	display: "swap",
	preload: false,
	variable: "--font-editor-libre-baskerville",
});

const jetBrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	display: "swap",
	preload: false,
	variable: "--font-editor-jetbrains-mono",
});

const firaCode = Fira_Code({
	subsets: ["latin"],
	display: "swap",
	preload: false,
	variable: "--font-editor-fira-code",
});

export const editorFontVariables = [
	inter.variable,
	lora.variable,
	sourceSerif.variable,
	merriweather.variable,
	libreBaskerville.variable,
	jetBrainsMono.variable,
	firaCode.variable,
].join(" ");
