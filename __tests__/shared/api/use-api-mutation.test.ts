import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type QueryKey = readonly unknown[];
type QueryClientMock = {
	cancelQueries: ReturnType<typeof mock>;
	getQueryData: ReturnType<typeof mock>;
	getQueryState: ReturnType<typeof mock>;
	setQueryData: ReturnType<typeof mock>;
	removeQueries: ReturnType<typeof mock>;
	invalidateQueries: ReturnType<typeof mock>;
};

let queryClient: QueryClientMock;
let mutationOptions: any;

function registerReactQueryMock() {
	mock.module("@tanstack/react-query", () => ({
		useQueryClient: () => queryClient,
		useMutation: (options: any) => {
			mutationOptions = options;
			return options;
		},
	}));
}

async function importUseApiMutation() {
	return await import(
		`@/shared/api/use-api-mutation?test=${Math.random().toString(36).slice(2)}`
	);
}

beforeEach(() => {
	mutationOptions = null;
	queryClient = {
		cancelQueries: mock(async () => undefined),
		getQueryData: mock((queryKey: QueryKey) => {
			const key = JSON.stringify(queryKey);
			if (key === JSON.stringify(["items"])) {
				return [{ id: "a", value: "before" }];
			}
			if (key === JSON.stringify(["items", "a"])) {
				return { id: "a", value: "before" };
			}
			return undefined;
		}),
		getQueryState: mock((queryKey: QueryKey) => {
			const key = JSON.stringify(queryKey);
			return key === JSON.stringify(["missing", "a"]) ? undefined : {};
		}),
		setQueryData: mock(() => undefined),
		removeQueries: mock(() => undefined),
		invalidateQueries: mock(() => undefined),
	};
});

afterEach(() => {
	mock.restore();
});

describe("useApiMutation optimistic updates", () => {
	test("rolls back every optimistic cache entry on error", async () => {
		registerReactQueryMock();
		const { useApiMutation } = await importUseApiMutation();

		useApiMutation(async () => ({ ok: true }), {
			optimistic: {
				updates: [
					{
						queryKey: ["items"],
						updater: (current: Array<{ id: string; value: string }> = []) =>
							current.map((item) => ({ ...item, value: "after" })),
					},
					{
						queryKey: (input: { id: string }) => ["items", input.id],
						updater: (current: { id: string; value: string } | undefined) =>
							current ? { ...current, value: "after" } : current,
					},
					{
						queryKey: (input: { id: string }) => ["missing", input.id],
						updater: () => ({ id: "a", value: "after" }),
					},
				],
			},
		});

		const context = await mutationOptions.onMutate({ id: "a" });
		mutationOptions.onError(new Error("nope"), { id: "a" }, context);

		expect(queryClient.cancelQueries).toHaveBeenCalledTimes(3);
		expect(queryClient.setQueryData).toHaveBeenCalledWith(
			["items"],
			[{ id: "a", value: "before" }],
		);
		expect(queryClient.setQueryData).toHaveBeenCalledWith(["items", "a"], {
			id: "a",
			value: "before",
		});
		expect(queryClient.removeQueries).toHaveBeenCalledWith({
			queryKey: ["missing", "a"],
			exact: true,
		});
	});

	test("invalidates all optimistic keys by default after settling", async () => {
		registerReactQueryMock();
		const { useApiMutation } = await importUseApiMutation();

		useApiMutation(async () => ({ ok: true }), {
			optimistic: {
				updates: [
					{ queryKey: ["items"], updater: (current) => current },
					{
						queryKey: (input: { id: string }) => ["items", input.id],
						updater: (current) => current,
					},
				],
			},
		});

		const context = await mutationOptions.onMutate({ id: "a" });
		mutationOptions.onSettled(undefined, undefined, { id: "a" }, context);

		expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["items"],
		});
		expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["items", "a"],
		});
	});
});
