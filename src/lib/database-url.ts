/**
 * pg v8 / pg-connection-string v2 treat sslmode=require as verify-full but warn
 * that v3 will use libpq semantics. Neon and other managed Postgres providers
 * expect verify-full behavior — normalize legacy values at the connection boundary.
 */
export function normalizeDatabaseUrl(connectionString: string): string {
	return connectionString.replace(
		/([?&]sslmode=)(require|prefer|verify-ca)(?=&|$)/i,
		"$1verify-full",
	);
}
