import { describe, expect, test } from "bun:test";
import { createWriteQueue } from "@/core/workspace-backend/write-queue";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("createWriteQueue", () => {
	test("serializes tasks sharing a key (no interleaving)", async () => {
		const queue = createWriteQueue();
		const log: string[] = [];

		function task(name: string) {
			return async () => {
				log.push(`${name}:start`);
				await Promise.resolve();
				await Promise.resolve();
				log.push(`${name}:end`);
			};
		}

		await Promise.all([
			queue.runExclusive("k", task("a")),
			queue.runExclusive("k", task("b")),
			queue.runExclusive("k", task("c")),
		]);

		expect(log).toEqual([
			"a:start",
			"a:end",
			"b:start",
			"b:end",
			"c:start",
			"c:end",
		]);
	});

	test("read-modify-write on one key cannot clobber a concurrent write", async () => {
		const queue = createWriteQueue();
		let store = 0;

		function increment() {
			return queue.runExclusive("counter", async () => {
				const read = store;
				await Promise.resolve();
				store = read + 1;
			});
		}

		await Promise.all(Array.from({ length: 50 }, increment));
		expect(store).toBe(50);
	});

	test("different keys run concurrently", async () => {
		const queue = createWriteQueue();
		const gateA = deferred<void>();
		const started: string[] = [];

		const a = queue.runExclusive("a", async () => {
			started.push("a");
			await gateA.promise;
		});
		const b = queue.runExclusive("b", async () => {
			started.push("b");
		});

		await b;
		expect(started).toContain("b");

		gateA.resolve();
		await a;
	});

	test("a rejected task surfaces to its caller but does not break the chain", async () => {
		const queue = createWriteQueue();
		const ran: string[] = [];

		const failing = queue.runExclusive("k", async () => {
			ran.push("failing");
			throw new Error("boom");
		});

		const following = queue.runExclusive("k", async () => {
			ran.push("following");
			return "ok";
		});

		await expect(failing).rejects.toThrow("boom");
		expect(await following).toBe("ok");
		expect(ran).toEqual(["failing", "following"]);
	});
});
