import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

function fromHere(path: string) {
	return fileURLToPath(new URL(path, import.meta.url));
}

const appSrc = fromHere("../../apps/web/src");
const appGenerated = fromHere("../../apps/web/generated");
const shims = fromHere("./src/shims");

export default defineConfig({
	plugins: [react(), tailwindcss()],
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
	},
	server: {
		port: 1421,
		strictPort: true,
	},
});
