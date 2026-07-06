import { describe, expect, test } from "bun:test";
import { normalizeDatabaseUrl } from "@/lib/database-url";

describe("normalizeDatabaseUrl", () => {
	test("upgrades legacy sslmode=require to verify-full", () => {
		const url = "postgresql://user:pass@host/db?sslmode=require&channel_binding=require";
		expect(normalizeDatabaseUrl(url)).toBe(
			"postgresql://user:pass@host/db?sslmode=verify-full&channel_binding=require",
		);
	});

	test("upgrades sslmode=prefer and verify-ca", () => {
		expect(normalizeDatabaseUrl("postgresql://h/db?sslmode=prefer")).toBe(
			"postgresql://h/db?sslmode=verify-full",
		);
		expect(normalizeDatabaseUrl("postgresql://h/db?sslmode=verify-ca")).toBe(
			"postgresql://h/db?sslmode=verify-full",
		);
	});

	test("leaves verify-full and disable unchanged", () => {
		const verifyFull = "postgresql://h/db?sslmode=verify-full";
		const disable = "postgresql://h/db?sslmode=disable";
		expect(normalizeDatabaseUrl(verifyFull)).toBe(verifyFull);
		expect(normalizeDatabaseUrl(disable)).toBe(disable);
	});
});
