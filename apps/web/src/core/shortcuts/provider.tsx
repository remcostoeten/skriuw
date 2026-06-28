"use client";

import * as React from "react";
import { useShortcutMap, type ShortcutMap } from "@remcostoeten/use-shortcut/react";
import type { ShortcutHelpGroup } from "@/shared/ui/shortcut-help-dialog";
import { SHORTCUT_REGISTRY, getShortcutDef, getShortcutIds, type ShortcutId } from "./registry";
import type { Scope } from "./scopes";
import { formatBinding } from "./keys";
import { loadBindings, saveBindings } from "./storage";
import type { ShortcutBindings, ShortcutHandlers } from "./types";

interface ShortcutContextValue {
	registry: typeof SHORTCUT_REGISTRY;
	/** Sparse user overrides; absent ids use the registry default. */
	bindings: ShortcutBindings;
	setBinding: (id: ShortcutId, combo: string) => void;
	resetBinding: (id: ShortcutId) => void;
	resetAllBindings: () => void;
	getHelpGroups: (scopes: Scope[]) => ShortcutHelpGroup[];
	getShortcutHint: (id: ShortcutId) => string;
}

const ShortcutContext = React.createContext<ShortcutContextValue | null>(null);

/**
 * Owns the persisted, user-remappable bindings shared by every shortcut
 * consumer and the settings UI. It does NOT register any key handlers itself —
 * each surface registers its own via {@link useScopedShortcuts}, which is the
 * library's `useShortcutMap` sourced from this registry.
 */
export function ShortcutProvider({ children }: { children: React.ReactNode }) {
	const [bindings, setBindings] = React.useState<ShortcutBindings>(() => loadBindings());

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
		}),
		[bindings, setBinding, resetBinding, resetAllBindings, getHelpGroups, getShortcutHint],
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
	const { bindings } = useShortcutManager();
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
}
