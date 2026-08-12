export function installMockLocalStorage(storage: Storage) {
	const originalLocalStorage = globalThis.localStorage;
	const originalWindow = (globalThis as typeof globalThis & { window?: Window }).window;

	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: storage,
	});
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { localStorage: storage },
	});

	return () => {
		Object.defineProperty(globalThis, "localStorage", {
			configurable: true,
			value: originalLocalStorage,
		});
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: originalWindow,
		});
	};
}
