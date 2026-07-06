"use client";

import React, { createContext, useContext, useRef, useState, useCallback, useMemo } from "react";
import { useShortcutScope } from "../shortcuts";
import { COMMAND_REGISTRY } from "./registry";
import type { Scope } from "../shortcuts/scopes";
import type { CommandPaletteItem } from "@/shared/ui/command-palette";

type CommandHandlers = Record<string, () => void>;
type CommandItemsProvider = (query: string) => CommandPaletteItem[];

type CommandContextValue = {
	registerHandlers: (handlers: CommandHandlers) => () => void;
	registerItemsProvider: (provider: CommandItemsProvider) => () => void;
	pushActiveScope: (scope: Scope | "global") => () => void;
	executeCommand: (id: string) => void;
	getRegisteredHandler: (id: string) => (() => void) | undefined;
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
	toggleOpen: () => void;
	query: string;
	setQuery: (query: string) => void;
	activeScope: Scope | "global";
	itemProviders: CommandItemsProvider[];
};

const CommandContext = createContext<CommandContextValue | null>(null);

export function CommandProvider({ children }: { children: React.ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [activeScopes, setActiveScopes] = useState<(Scope | "global")[]>(["global"]);

	const handlersRef = useRef<Record<string, (() => void)[]>>({});
	const [itemProviders, setItemProviders] = useState<CommandItemsProvider[]>([]);

	const registerHandlers = useCallback((newHandlers: CommandHandlers) => {
		const keys = Object.keys(newHandlers);
		for (const key of keys) {
			if (!handlersRef.current[key]) {
				handlersRef.current[key] = [];
			}
			handlersRef.current[key].push(newHandlers[key]);
		}

		return () => {
			for (const key of keys) {
				const list = handlersRef.current[key];
				if (list) {
					const index = list.indexOf(newHandlers[key]);
					if (index !== -1) {
						list.splice(index, 1);
					}
					if (list.length === 0) {
						delete handlersRef.current[key];
					}
				}
			}
		};
	}, []);

	const registerItemsProvider = useCallback((provider: CommandItemsProvider) => {
		setItemProviders((prev) => [...prev, provider]);
		return () => {
			setItemProviders((prev) => prev.filter((p) => p !== provider));
		};
	}, []);

	const pushActiveScope = useCallback((scope: Scope | "global") => {
		setActiveScopes((prev) => [...prev, scope]);
		return () => {
			setActiveScopes((prev) => {
				const idx = prev.lastIndexOf(scope);
				if (idx !== -1) {
					const next = [...prev];
					next.splice(idx, 1);
					return next;
				}
				return prev;
			});
		};
	}, []);

	const executeCommand = useCallback((id: string) => {
		const list = handlersRef.current[id];
		const handler = list && list.length > 0 ? list[list.length - 1] : undefined;
		if (handler) {
			handler();
		} else {
			console.warn(`No handler registered for command: ${id}`);
		}
	}, []);

	const getRegisteredHandler = useCallback((id: string) => {
		const list = handlersRef.current[id];
		return list && list.length > 0 ? list[list.length - 1] : undefined;
	}, []);

	const toggleOpen = useCallback(() => {
		setIsOpen((prev) => !prev);
		setQuery("");
	}, []);

	const activeScope = activeScopes[activeScopes.length - 1] ?? "global";

	const value = useMemo<CommandContextValue>(
		() => ({
			registerHandlers,
			registerItemsProvider,
			pushActiveScope,
			executeCommand,
			getRegisteredHandler,
			isOpen,
			setIsOpen,
			toggleOpen,
			query,
			setQuery,
			activeScope,
			itemProviders,
		}),
		[
			registerHandlers,
			registerItemsProvider,
			pushActiveScope,
			executeCommand,
			getRegisteredHandler,
			isOpen,
			setIsOpen,
			toggleOpen,
			query,
			setQuery,
			activeScope,
			itemProviders,
		],
	);

	return (
		<CommandContext.Provider value={value}>
			{children}
			<CommandShortcutBinder />
		</CommandContext.Provider>
	);
}

function CommandShortcutBinder() {
	const { executeCommand, toggleOpen, activeScope } = useCommandRegistry();

	// The command palette and settings toggles are bound exactly once, in the
	// always-active `app` scope, so a single `mod+k` / `mod+comma` fires one
	// toggle. Binding them redundantly per scope (as before) made the net result
	// depend on the *parity* of how many scopes were active — remove or gate one
	// and the toggle silently became a no-op. `app.settings` is supplied by
	// `appHandlers` below; the palette toggle is bound here.
	useShortcutScope("app", { "app.commandPalette": toggleOpen });

	// Notes / journal shortcuts fire only while their surface is mounted. The
	// scope's `useActiveCommandScope` push (see use-notes-layout / use-journal-
	// layout) is what makes `activeScope` match, so gating on it keeps e.g. `/`
	// or `mod+n` from firing (and navigating away) on unrelated routes.
	const notesHandlers = useMemo<Record<string, () => void>>(() => {
		const handlers: Record<string, () => void> = {};
		for (const [id, cmd] of Object.entries(COMMAND_REGISTRY)) {
			if (cmd.scope === "notes" && cmd.shortcutId) {
				handlers[cmd.shortcutId] = () => executeCommand(id);
			}
		}
		return handlers;
	}, [executeCommand]);
	useShortcutScope("notes", notesHandlers, { active: activeScope === "notes" });

	const journalHandlers = useMemo<Record<string, () => void>>(() => {
		const handlers: Record<string, () => void> = {};
		for (const [id, cmd] of Object.entries(COMMAND_REGISTRY)) {
			if (cmd.scope === "journal" && cmd.shortcutId) {
				handlers[cmd.shortcutId] = () => executeCommand(id);
			}
		}
		return handlers;
	}, [executeCommand]);
	useShortcutScope("journal", journalHandlers, { active: activeScope === "journal" });

	// App-scope global commands (e.g. `app.settings` → open settings). Always
	// active, and each command binds a single handler, so no parity dependence.
	const appHandlers = useMemo<Record<string, () => void>>(() => {
		const handlers: Record<string, () => void> = {};
		for (const [id, cmd] of Object.entries(COMMAND_REGISTRY)) {
			if (cmd.scope === "global" && cmd.shortcutId && cmd.shortcutId.startsWith("app.")) {
				handlers[cmd.shortcutId] = () => executeCommand(id);
			}
		}
		return handlers;
	}, [executeCommand]);
	useShortcutScope("app", appHandlers);

	return null;
}

export function useCommandRegistry() {
	const context = useContext(CommandContext);
	if (!context) {
		throw new Error("useCommandRegistry must be used within a CommandProvider");
	}
	return context;
}

export function useRegisterCommands(handlers: CommandHandlers) {
	const { registerHandlers } = useCommandRegistry();
	const latestHandlers = useRef(handlers);
	latestHandlers.current = handlers;

	React.useEffect(() => {
		const wrappedHandlers: CommandHandlers = {};
		for (const key of Object.keys(handlers)) {
			wrappedHandlers[key] = () => latestHandlers.current[key]?.();
		}
		return registerHandlers(wrappedHandlers);
	}, [registerHandlers, ...Object.keys(handlers)]);
}

export function useRegisterCommandItemsProvider(provider: CommandItemsProvider) {
	const { registerItemsProvider } = useCommandRegistry();
	const latestProvider = useRef(provider);
	latestProvider.current = provider;

	React.useEffect(() => {
		const wrappedProvider: CommandItemsProvider = (q) => latestProvider.current(q);
		return registerItemsProvider(wrappedProvider);
	}, [registerItemsProvider]);
}

export function useActiveCommandScope(scope: Scope | "global") {
	const { pushActiveScope } = useCommandRegistry();
	React.useEffect(() => {
		return pushActiveScope(scope);
	}, [pushActiveScope, scope]);
}
