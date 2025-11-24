import { defineConfig } from "drizzle-kit";

export default defineConfig({
        schema: "./src/data/drizzle/base-entities.ts",
        out: "./drizzle/libsql",
        dialect: "sqlite",
        dbCredentials: {
                url: process.env.LIBSQL_DB_URL ?? "file:./drizzle/libsql/libsql.db"
        }
});
