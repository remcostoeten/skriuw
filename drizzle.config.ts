import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const schema = "./src/api/db/schema.ts";
const out = "./drizzle";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required for Postgres connection.");
}

export default defineConfig({
  schema,
  out,
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
