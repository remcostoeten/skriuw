import "dotenv/config";
import { defineConfig } from "drizzle-kit";

type DrizzleTarget = "desktop" | "web";

const schema = "./src/db/schema.ts";
const out = "./drizzle";

const target = (process.env.DRIZZLE_TARGET as DrizzleTarget | undefined) ?? "desktop";

const configByTarget: Record<DrizzleTarget, ReturnType<typeof defineConfig>> = {
  web: {
    schema,
    out,
    dialect: "sqlite",
    driver: "turso",
    dbCredentials: {
      url: process.env.LIBSQL_DATABASE_URL ?? "",
      authToken: process.env.LIBSQL_AUTH_TOKEN,
    },
  },
  desktop: {
    schema,
    out,
    dialect: "sqlite",
    dbCredentials: {
      url: process.env.SQLITE_DATABASE_PATH ?? "./local.sqlite",
    },
  },
};

const selected = configByTarget[target];

if (!selected) {
  throw new Error(`Unsupported DRIZZLE_TARGET: ${target}`);
}

if (target === "web" && !process.env.LIBSQL_DATABASE_URL) {
  throw new Error("LIBSQL_DATABASE_URL is required for the web (libsql) target.");
}

export default defineConfig(selected);
