const STORAGE_KEY = "skriuw:command-frecency:v1";
const MAX_ENTRIES = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

type FrecencyEntry = {
	count: number;
	lastUsed: number;
};

type FrecencyStore = Record<string, FrecencyEntry>;

function readStore(): FrecencyStore {
	if (typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		return parsed as FrecencyStore;
	} catch {
		return {};
	}
}

function writeStore(store: FrecencyStore) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
	} catch {
		return;
	}
}

/**
 * Records that a palette command was run, bumping its use count and freshness.
 * The store is capped at {@link MAX_ENTRIES}; the stalest entries are evicted.
 */
export function recordCommandUse(id: string): void {
	const store = readStore();
	const existing = store[id];
	store[id] = {
		count: (existing?.count ?? 0) + 1,
		lastUsed: Date.now(),
	};

	const entries = Object.entries(store);
	if (entries.length > MAX_ENTRIES) {
		entries.sort(([, a], [, b]) => b.lastUsed - a.lastUsed);
		writeStore(Object.fromEntries(entries.slice(0, MAX_ENTRIES)));
		return;
	}

	writeStore(store);
}

/**
 * Returns a frecency score per command id: the use count decayed by how long
 * ago the command was last run. Higher is more relevant. Ids never used are
 * absent from the map.
 */
export function getCommandFrecency(): Record<string, number> {
	const store = readStore();
	const now = Date.now();
	const scores: Record<string, number> = {};

	for (const [id, entry] of Object.entries(store)) {
		if (!entry || typeof entry.count !== "number" || typeof entry.lastUsed !== "number") {
			continue;
		}
		scores[id] = entry.count * recencyWeight(now - entry.lastUsed);
	}

	return scores;
}

function recencyWeight(age: number): number {
	if (age < DAY_MS) return 1;
	if (age < 7 * DAY_MS) return 0.7;
	if (age < 30 * DAY_MS) return 0.4;
	return 0.2;
}
