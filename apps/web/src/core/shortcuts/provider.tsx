"use client";

import * as React from "react";
import { useShortcutMap, type ShortcutMap } from "@remcostoeten/use-shortcut/react";
import type { ShortcutHelpGroup } from "@/shared/ui/shortcut-help-dialog";
import { SHORTCUT_REGISTRY, getShortcutDef, getShortcutIds, type ShortcutId } from "./registry";
import type { Scope } from "./scopes";
import { formatBinding } from "./keys";
import { loadBindings, saveBindings } from "./storage";
import type { ShortcutBindings, ShortcutHandler, ShortcutHandlers } from "./types";

type ShortcutContextValue = {
	registry: typeof SHORTCUT_REGISTRY;
	/** Sparse user overrides; absent ids use the registry default. */
	bindings: ShortcutBindings;
	setBinding: (id: ShortcutId, combo: string) => void;
	resetBinding: (id: ShortcutId) => void;
	resetAllBindings: () => void;
	getHelpGroups: (scopes: Scope[]) => ShortcutHelpGroup[];
	getShortcutHint: (id: ShortcutId) => string;
	/**
	 * Registers the live handler for a shortcut id so it can be invoked outside
	 * normal DOM keydown dispatch (currently: the desktop global-shortcut
	 * bridge below). Returns an unregister function. Internal to this module's
	 * hooks — not part of the public shortcut API surface.
	 */
	registerLiveHandler: (id: ShortcutId, handler: ShortcutHandler) => () => void;
}

const ShortcutContext = React.createContext<ShortcutContextValue | null>(null);

type TauriEventApi = {
	listen: (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;
};

type TauriGlobal = { __TAURI__?: { event?: TauriEventApi } };

/**
 * Listens for the `global-shortcut` event the Rust shell emits when an
 * OS-level shortcut registered via `tauri-plugin-global-shortcut` fires (see
 * `apps/desktop/src-tauri/src/lib.rs`, `GLOBAL_SHORTCUTS`). The payload is the
 * `ShortcutId` string; dispatch reuses whatever handler the in-app scope most
 * recently registered for that id, so the behavior stays defined in one place.
 * No-ops outside the Tauri runtime (web build).
 */
function useGlobalShortcutBridge(handlersRef: React.RefObject<Partial<Record<ShortcutId, ShortcutHandler>>>): void {
	React.useEffect(() => {
		const events = (window as unknown as TauriGlobal).__TAURI__?.event;
		if (!events) return;

		let unlisten: (() => void) | undefined;
		let cancelled = false;

		events
			.listen("global-shortcut", (event) => {
				const id = event.payload;
				if (typeof id !== "string") return;
				const handler = handlersRef.current[id as ShortcutId];
				handler?.(new KeyboardEvent("keydown"));
			})
			.then((fn) => {
				if (cancelled) {
					fn();
					return;
				}
				unlisten = fn;
			})
			.catch((error) => {
				console.error("Failed to listen for global-shortcut events", error);
			});

		return () => {
			cancelled = true;
			unlisten?.();
		};
	}, [handlersRef]);
}

/**
 * Owns the persisted, user-remappable bindings shared by every shortcut
 * consumer and the settings UI. It does NOT register any key handlers itself —
 * each surface registers its own via {@link useScopedShortcuts}, which is the
 * library's `useShortcutMap` sourced from this registry.
 */
export function ShortcutProvider({ children }: { children: React.ReactNode }) {
	const [bindings, setBindings] = React.useState<ShortcutBindings>(() => loadBindings());
	const liveHandlersRef = React.useRef<Partial<Record<ShortcutId, ShortcutHandler>>>({});

	const registerLiveHandler = React.useCallback((id: ShortcutId, handler: ShortcutHandler) => {
		liveHandlersRef.current[id] = handler;
		return () => {
			if (liveHandlersRef.current[id] === handler) {
				delete liveHandlersRef.current[id];
			}
		};
	}, []);

	useGlobalShortcutBridge(liveHandlersRef);

	const setBinding = React.useCallback((id: ShortcutId, combo: string) => {
		setBindings((prev) => {
			const next = { ...prev, [id]: combo };
			saveBindings(next);
			return next;
		});
	}, []);

	const resetBinding = React.useCallback((id: ShortcutId) => {
		setBindings((prev) => {
			const next = { ...prev };
			delete next[id];
			saveBindings(next);
			return next;
		});
	}, []);

	const resetAllBindings = React.useCallback(() => {
		setBindings(() => {
			saveBindings({});
			return {};
		});
	}, []);

	const getHelpGroups = React.useCallback(
		(scopes: Scope[]): ShortcutHelpGroup[] => {
			const groups = new Map<string, ShortcutHelpGroup>();
			for (const id of getShortcutIds()) {
				const def = getShortcutDef(id);
				if (!scopes.includes(def.scope)) continue;
				const existing = groups.get(def.group) ?? {
					id: def.group,
					title: def.group,
					shortcuts: [],
				};
				existing.shortcuts.push({
					id,
					label: def.label,
					combo: formatBinding(bindings[id] ?? def.keys),
					description: def.description,
				});
				groups.set(def.group, existing);
			}
			return Array.from(groups.values());
		},
		[bindings],
	);

	const getShortcutHint = React.useCallback(
		(id: ShortcutId) => formatBinding(bindings[id] ?? getShortcutDef(id).keys),
		[bindings],
	);

	const value = React.useMemo<ShortcutContextValue>(
		() => ({
			registry: SHORTCUT_REGISTRY,
			bindings,
			setBinding,
			resetBinding,
			resetAllBindings,
			getHelpGroups,
			getShortcutHint,
			registerLiveHandler,
		}),
		[bindings, setBinding, resetBinding, resetAllBindings, getHelpGroups, getShortcutHint, registerLiveHandler],
	);

	return <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>;
}

export function useShortcutManager(): ShortcutContextValue {
	const ctx = React.useContext(ShortcutContext);
	if (!ctx) throw new Error("useShortcutManager must be used inside <ShortcutProvider>");
	return ctx;
}

export function useShortcutHint(id?: ShortcutId): string | undefined {
	const ctx = React.useContext(ShortcutContext);
	if (!id) return undefined;
	return ctx?.getShortcutHint(id) ?? formatBinding(getShortcutDef(id).keys);
}

type ScopedShortcutOptions = {
	/** When false the shortcuts stay registered but inert (e.g. a closed menu). */
	active?: boolean;
};

/**
 * Registers the given scope's shortcuts with the library, resolving each combo
 * from the shared (remappable) registry. Handlers are read through a ref, so
 * callers don't need to memoize them. This is the only place app code touches
 * `useShortcutMap` — everything else flows through the registry.
 */
export function useShortcutScope(
	scope: Scope,
	handlers: ShortcutHandlers,
	options: ScopedShortcutOptions = {},
): void {
	const { bindings, registerLiveHandler } = useShortcutManager();
	const active = options.active ?? true;
	const latest = React.useRef(handlers);
	latest.current = handlers;

	const shortcutMap = React.useMemo<ShortcutMap>(() => {
		const map: ShortcutMap = {};
		for (const id of getShortcutIds()) {
			const def = getShortcutDef(id);
			if (def.scope !== scope) continue;
			map[id] = {
				keys: bindings[id] ?? def.keys,
				handler: (event) => latest.current[id]?.(event),
				options: {
					scopes: [scope],
					except: def.except === false ? undefined : (def.except ?? "typing"),
					preventDefault: def.preventDefault,
					description: def.description ?? def.label,
				},
			};
		}
		return map;
	}, [scope, bindings]);

	useShortcutMap(shortcutMap, {
		activeScopes: active ? [scope] : [],
		ignoreInputs: false,
	});

	// Mirror this scope's handlers for ids marked `global: true` into the
	// shared live-handler registry, so the desktop global-shortcut bridge can
	// dispatch to the same behavior an in-app keypress would trigger.
	React.useEffect(() => {
		const globalIds = getShortcutIds().filter((id) => getShortcutDef(id).scope === scope && getShortcutDef(id).global);
		if (globalIds.length === 0) return;

		const unregisterFns = globalIds.map((id) => registerLiveHandler(id, (event) => latest.current[id]?.(event)));
		return () => {
			for (const unregister of unregisterFns) unregister();
		};
	}, [scope, registerLiveHandler]);
}
