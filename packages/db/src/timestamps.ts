const POSTGRES_INT_MAX = 2147483647

function coerceNumber(value: number | null | undefined): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return Date.now()
	}
	return value
}

export function getSafeTimestamp(value?: number): number {
	const base = Math.floor(coerceNumber(value))

	// Keep reducing overflowing values (e.g. millisecond timestamps) until they fit in a 32-bit column.
	let safeValue = base
	while (safeValue > POSTGRES_INT_MAX) {
		safeValue = Math.floor(safeValue / 1000)
	}

	return safeValue
}
