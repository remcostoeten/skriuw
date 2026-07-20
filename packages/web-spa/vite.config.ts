import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, type PluginOption } from "vite";

const analyze = process.env.ANALYZE === "true";

function fromHere(path: string) {
	return fileURLToPath(new URL(path, import.meta.url));
}

const appSrc = fromHere("../../apps/web/src");
const appGenerated = fromHere("../../generated");
const shims = fromHere("./src/shims");

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		analyze &&
			(visualizer({
				filename: "dist/bundle-report.html",
				template: "treemap",
				gzipSize: true,
				brotliSize: true,
			}) as unknown as PluginOption),
	],
	resolve: {
		dedupe: ["react", "react-dom", "@tanstack/react-query"],
		alias: [
			{ find: /^next\/navigation$/, replacement: `${shims}/next-navigation.tsx` },
			{ find: /^next\/link$/, replacement: `${shims}/next-link.tsx` },
			{ find: /^next\/dynamic$/, replacement: `${shims}/next-dynamic.ts` },
			{ find: /^next\/image$/, replacement: `${shims}/next-image.tsx` },
			{ find: /^next\/font\/google$/, replacement: `${shims}/next-font-google.ts` },
			{ find: /^next\/headers$/, replacement: `${shims}/empty-server-module.ts` },
			{ find: /^next\/server$/, replacement: `${shims}/empty-server-module.ts` },
			{ find: /^next\/cache$/, replacement: `${shims}/empty-server-module.ts` },
			{ find: /^next\/og$/, replacement: `${shims}/empty-server-module.ts` },
			{ find: /^server-only$/, replacement: `${shims}/empty.ts` },
			{ find: /^client-only$/, replacement: `${shims}/empty.ts` },
			{ find: /^node:crypto$/, replacement: `${shims}/node-crypto.ts` },
			{ find: /^crypto$/, replacement: `${shims}/node-crypto.ts` },
			{ find: /^node:util$/, replacement: `${shims}/node-util.ts` },
			{ find: /^@\/lib\/prisma$/, replacement: `${shims}/server-stub-prisma.ts` },
			{ find: /^@\/lib\/auth$/, replacement: `${shims}/server-stub-auth.ts` },
			{
				find: /^@\/core\/workspace-backend\/server-backend$/,
				replacement: `${shims}/server-stub-backend.ts`,
			},
			{
				find: /^@\/generated\/prisma\/client$/,
				replacement: `${shims}/server-stub-prisma-client.ts`,
			},
			{ find: "@/generated", replacement: appGenerated },
			{ find: "@", replacement: appSrc },
		],
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		manifest: true,
		target: "esnext",
		minify: "esbuild",
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) return;
					// NOTE: @blocknote/prosemirror are deliberately NOT grouped into a
					// manual "editor" chunk. That grouping forced the ~486 KB gzip
					// editor code into the static startup graph even though the
					// RichTextEditor is dynamically imported — a shared manual chunk
					// gets hoisted static. Letting Rollup split them keeps the editor
					// fully on-demand and cut static initial JS gzip ~31% (DH-06).
					// force-graph/three (graph route) and shiki (code highlighting)
					// stay grouped: both are already reached only through dynamic
					// imports, and grouping keeps each feature a single cached chunk.
					if (id.includes("react-force-graph") || id.includes("/three/")) {
						return "graph";
					}
					if (id.includes("shiki")) {
						return "shiki";
					}
					return undefined;
				},
			},
		},
	},
	server: {
		host: "127.0.0.1",
		port: 1421,
		strictPort: true,
	},
});
