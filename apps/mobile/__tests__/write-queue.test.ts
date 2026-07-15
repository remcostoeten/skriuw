import { describe, expect, test } from "bun:test";
import { WriteQueue } from "../src/backend/write-queue";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("WriteQueue", () => {
	test("runs a single task and resolves with its value", async () => {
		const queue = new WriteQueue();
		const result = await queue.enqueue("a", async () => 42);
		expect(result).toBe(42);
	});

	test("serializes tasks for the same key", async () => {
		const queue = new WriteQueue();
		const order: string[] = [];
		const first = deferred<void>();

		const firstDone = queue.enqueue("note-1", async () => {
			order.push("first-start");
			await first.promise;
			order.push("first-end");
		});
		await Bun.sleep(0);

		const secondDone = queue.enqueue("note-1", async () => {
			order.push("second");
		});
		await Bun.sleep(0);

		expect(order).toEqual(["first-start"]);
		first.resolve();
		await Promise.all([firstDone, secondDone]);
		expect(order).toEqual(["first-start", "first-end", "second"]);
	});

	test("runs tasks for different keys concurrently", async () => {
		const queue = new WriteQueue();
		const blockerA = deferred<void>();
		const started: string[] = [];

		const a = queue.enqueue("a", async () => {
			started.push("a");
			await blockerA.promise;
		});
		const b = queue.enqueue("b", async () => {
			started.push("b");
		});

		await b;
		expect(started).toContain("b");
		blockerA.resolve();
		await a;
	});

	test("coalesces: only the latest pending task runs after the in-flight one", async () => {
		const queue = new WriteQueue();
		const first = deferred<void>();
		const ran: string[] = [];

		const inFlight = queue.enqueue("note-1", async () => {
			ran.push("in-flight");
			await first.promise;
		});
		await Bun.sleep(0);

		void queue.enqueue("note-1", async () => {
			ran.push("stale");
		});
		const latest = queue.enqueue("note-1", async () => {
			ran.push("latest");
			return "latest-result";
		});

		first.resolve();
		await inFlight;
		await expect(latest).resolves.toBe("latest-result");
		expect(ran).toEqual(["in-flight", "latest"]);
	});

	test("a rejected task does not wedge the queue for its key", async () => {
		const queue = new WriteQueue();

		await expect(
			queue.enqueue("note-1", async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		const result = await queue.enqueue("note-1", async () => "recovered");
		expect(result).toBe("recovered");
	});
});
