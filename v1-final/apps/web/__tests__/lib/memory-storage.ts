export class MemoryStorage implements Storage {
	#entries = new Map<string, string>();

	clear() {
		this.#entries.clear();
	}

	getItem(key: string) {
		return this.#entries.get(key) ?? null;
	}

	key(index: number) {
		return Array.from(this.#entries.keys())[index] ?? null;
	}

	removeItem(key: string) {
		this.#entries.delete(key);
	}

	setItem(key: string, value: string) {
		this.#entries.set(key, value);
	}

	get length() {
		return this.#entries.size;
	}
}
