import { beforeEach, describe, expect, mock, test } from "bun:test";

type SubscriptionRow = {
	id: string;
	userId: string;
	url: string;
	label: string;
	mode: string;
	enabled: boolean;
	lastSyncAt: Date | null;
	lastSyncStatus: string | null;
	lastSyncError: string | null;
	createdAt: Date;
};

let rows: SubscriptionRow[];
let fetchIcs: ReturnType<typeof mock>;
let importIcs: ReturnType<typeof mock>;

function makeRow(overrides: Partial<SubscriptionRow>): SubscriptionRow {
	return {
		id: crypto.randomUUID(),
		userId: "user-1",
		url: "https://example.com/cal.ics",
		label: "External calendar",
		mode: "skip",
		enabled: true,
		lastSyncAt: null,
		lastSyncStatus: null,
		lastSyncError: null,
		createdAt: new Date(),
		...overrides,
	};
}

beforeEach(() => {
	rows = [];
	fetchIcs = mock(async () => "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
	importIcs = mock(async () => ({
		summary: { created: 1, updated: 0, skippedDuplicates: 0, skippedInvalid: 0, failed: 0 },
		skipped: [],
	}));
	mock.module("server-only", () => ({}));
	mock.module("@/lib/safe-fetch-ics", () => ({
		fetchIcsFromUrl: fetchIcs,
		normalizeSubscriptionUrl: (url: string) => {
			if (!url.startsWith("https://") && !url.startsWith("webcal://")) {
				throw new Error("Only https:// (or webcal://) calendar URLs are supported.");
			}
			return url.replace(/^webcal:/, "https:");
		},
	}));
	mock.module("@/domain/journal/ics-import-server", () => ({ importJournalIcs: importIcs }));
	mock.module("@/core/db", () => ({
		prisma: {
			calendarSubscription: {
				count: async ({ where }: { where: { userId: string } }) =>
					rows.filter((row) => row.userId === where.userId).length,
				findMany: async ({ where }: { where: Record<string, unknown> }) => {
					if (where.enabled !== undefined) {
						return rows.filter((row) => row.enabled && row.lastSyncAt === null);
					}
					return rows.filter((row) => row.userId === where.userId);
				},
				findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
					rows.find((row) => row.id === where.id && row.userId === where.userId) ?? null,
				create: async ({ data }: { data: Record<string, unknown> }) => {
					const row = makeRow(data as Partial<SubscriptionRow>);
					rows.push(row);
					return row;
				},
				update: async ({
					where,
					data,
				}: {
					where: { id: string };
					data: Partial<SubscriptionRow>;
				}) => {
					const row = rows.find((entry) => entry.id === where.id);
					Object.assign(row as SubscriptionRow, data);
					return row;
				},
				updateMany: async ({
					where,
					data,
				}: {
					where: { id: string };
					data: Partial<SubscriptionRow>;
				}) => {
					for (const row of rows.filter((entry) => entry.id === where.id)) {
						Object.assign(row, data);
					}
				},
				deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
					rows = rows.filter(
						(row) => !(row.id === where.id && row.userId === where.userId),
					);
				},
			},
		},
	}));
});

async function loadModule() {
	return import(
		`@/domain/journal/calendar-subscriptions?test=${Math.random().toString(36).slice(2)}`
	);
}

describe("createCalendarSubscription", () => {
	test("defaults to skip mode and caps at five", async () => {
		const { createCalendarSubscription } = await loadModule();
		const created = await createCalendarSubscription("user-1", {
			url: "https://example.com/a.ics",
			mode: "bogus",
		});
		expect(created.mode).toBe("skip");
		for (let i = 0; i < 4; i += 1) {
			await createCalendarSubscription("user-1", { url: `https://example.com/${i}.ics` });
		}
		await expect(
			createCalendarSubscription("user-1", { url: "https://example.com/6.ics" }),
		).rejects.toThrow(/at most 5/);
	});

	test("rejects invalid urls", async () => {
		const { createCalendarSubscription } = await loadModule();
		await expect(
			createCalendarSubscription("user-1", { url: "http://example.com/a.ics" }),
		).rejects.toThrow();
	});
});

describe("updateCalendarSubscription", () => {
	test("returns null for another user's subscription", async () => {
		rows.push(makeRow({ userId: "someone-else" }));
		const { updateCalendarSubscription } = await loadModule();
		const result = await updateCalendarSubscription("user-1", rows[0].id, { enabled: false });
		expect(result).toBeNull();
		expect(rows[0].enabled).toBe(true);
	});
});

describe("syncDueCalendarSubscriptions", () => {
	test("one failing subscription does not block the rest", async () => {
		rows.push(makeRow({ id: crypto.randomUUID() }), makeRow({ id: crypto.randomUUID() }));
		let call = 0;
		fetchIcs.mockImplementation(async () => {
			call += 1;
			if (call === 1) throw new Error("boom");
			return "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
		});
		const { syncDueCalendarSubscriptions } = await loadModule();
		const outcomes = await syncDueCalendarSubscriptions();
		expect(outcomes).toHaveLength(2);
		expect(outcomes[0].status).toBe("error");
		expect(outcomes[1].status).toBe("ok");
		expect(rows[0].lastSyncStatus).toBe("error");
		expect(rows[0].lastSyncError).toBe("boom");
		expect(rows[1].lastSyncStatus).toBe("ok");
	});

	test("passes the subscription mode through to the importer", async () => {
		rows.push(makeRow({ mode: "update" }));
		const { syncDueCalendarSubscriptions } = await loadModule();
		await syncDueCalendarSubscriptions();
		expect(importIcs.mock.calls[0][3]).toBe("update");
	});
});
