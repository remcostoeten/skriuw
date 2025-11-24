import { defineConfig } from "drizzle-kit";

export default defineConfig({
        schema: "./src/data/drizzle/base-entities.ts",
        out: "./drizzle/sqlite",
        dialect: "sqlite",
        dbCredentials: {
                url: "file:./drizzle/sqlite/local.db"
        }
});
