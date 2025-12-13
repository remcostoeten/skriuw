import { spawn } from "bun";
import { checkDockerDB } from "./check-db";

// Run the database check
await checkDockerDB();

// Print startup banner
const databaseProvider = process.env.DATABASE_PROVIDER || "postgres";
console.log(`\n🚀 Starting Skriuw...`);
console.log(`📦 Database: ${databaseProvider} (Check .env to switch)\n`);

spawn(["bun", "run", "turbo", "dev"], {
    stdio: ["inherit", "inherit", "inherit"],
});
