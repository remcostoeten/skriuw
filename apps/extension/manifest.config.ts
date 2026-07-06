import { defineManifest } from "@crxjs/vite-plugin";
import { EXTENSION_VERSION } from "./src/shared/version";

const isDev = process.env.NODE_ENV !== "production";

const productionHosts = ["https://skriuw.app/*", "https://*.skriuw.app/*"];
const devHosts = ["http://localhost:3000/*", "http://127.0.0.1:3000/*"];

export default defineManifest({
	manifest_version: 3,
	name: isDev ? "Skriuw Web Clipper (dev)" : "Skriuw Web Clipper",
	version: EXTENSION_VERSION,
	description: "Save pages, articles and selections to Skriuw.",
	minimum_chrome_version: "116",
	permissions: ["activeTab", "contextMenus", "storage", "scripting", "notifications", "alarms"],
	host_permissions: isDev ? [...productionHosts, ...devHosts] : productionHosts,
	background: {
		service_worker: "src/background/index.ts",
		type: "module",
	},
	action: {
		default_title: "Save to Skriuw",
		default_popup: "src/popup/index.html",
	},
	options_ui: {
		page: "src/options/index.html",
		open_in_tab: true,
	},
	commands: {
		"save-page": {
			suggested_key: { default: "Ctrl+Shift+S", mac: "Command+Shift+S" },
			description: "Save current page to Skriuw",
		},
		_execute_action: {
			suggested_key: { default: "Ctrl+Shift+K", mac: "Command+Shift+K" },
		},
	},
	icons: {
		"16": "icons/icon-16.png",
		"48": "icons/icon-48.png",
		"128": "icons/icon-128.png",
	},
});
