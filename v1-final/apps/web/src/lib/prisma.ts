import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeDatabaseUrl } from "@/lib/database-url";

declare global {
	// eslint-disable-next-line no-var
	var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is not set");
	}
	const adapter = new PrismaPg({ connectionString: normalizeDatabaseUrl(connectionString) });
	return new PrismaClient({ adapter });
}

export const prisma = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
	global.__prisma = prisma;
}
