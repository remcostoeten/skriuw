import { defineConfig } from "prisma/config";
import "dotenv/config";
import { normalizeDatabaseUrl } from "./apps/web/src/lib/database-url";

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: normalizeDatabaseUrl(process.env.DATABASE_URL ?? ""),
	},
});
