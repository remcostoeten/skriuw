import { afterEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const registeredDestinations: string[] = [];

function passthrough({ children }: { children: ReactNode }) {
	return children;
}

afterEach(() => {
	registeredDestinations.length = 0;
	mock.restore();
});

describe("IconRail go-to registrations", () => {
	test("keeps collapsed Explore routes registered", async () => {
		mock.module("next/link", () => ({
			default: ({ children, href }: { children: ReactNode; href: string }) => (
				<a href={href}>{children}</a>
			),
		}));
		mock.module("next/navigation", () => ({
			usePathname: () => "/app",
			useRouter: () => ({ push: () => undefined }),
		}));
		mock.module("@/shared/ui/tooltip", () => ({
			Tooltip: passthrough,
			TooltipTrigger: passthrough,
			TooltipContent: () => null,
		}));
		mock.module("@/shared/ui/dropdown-menu", () => ({
			DropdownMenu: passthrough,
			DropdownMenuTrigger: passthrough,
			DropdownMenuContent: () => null,
			DropdownMenuItem: passthrough,
		}));
		mock.module("@/features/settings/store", () => ({
			usePreferencesStore: (selector: (state: unknown) => unknown) =>
				selector({ appearance: { showAnimatedIcons: false } }),
		}));
		mock.module("@/features/settings/use-settings-modal", () => ({
			useSettingsModal: (selector: (state: unknown) => unknown) =>
				selector({ isOpen: false, open: () => undefined }),
		}));
		mock.module("@/core/auth/use-auth", () => ({
			useAuth: () => ({ isReady: true, phase: "signed_out", user: null }),
		}));
		mock.module("@/core/auth", () => ({ signOut: () => undefined }));
		mock.module("@/core/workspace-backend", () => ({
			isTauriRuntime: () => false,
			useWorkspaceCapabilities: () => ({ journal: true, tasks: true, trash: true }),
		}));
		mock.module("@/core/shortcuts", () => ({ useShortcutHint: () => null }));
		mock.module("@/core/quick-access", () => {
			const route = Object.fromEntries(
				["notes", "journal", "graph", "tasks", "tags", "people", "activity", "trash"].map(
					(id) => [
						id,
						{ id: `route.${id}`, label: id, type: "route", path: `/app/${id}` },
					],
				),
			);
			return {
				goto: { route },
				useGotoTarget: ({ to }: { to: { id: string } }) => {
					registeredDestinations.push(to.id);
					return () => undefined;
				},
			};
		});
		mock.module("@/lib/roles", () => ({ isAdmin: () => false }));
		mock.module("@/features/layout/components/user-menu", () => ({ UserMenu: () => null }));
		mock.module("@/features/layout/components/avatar-skeleton", () => ({
			AvatarSkeleton: () => null,
		}));
		mock.module("@/features/layout/components/auth-drawer-host-lazy", () => ({
			AuthDrawerHost: () => null,
		}));
		mock.module("@/features/layout/components/open-auth-drawer", () => ({
			openAuthDrawer: () => undefined,
		}));

		const { IconRail } = await import(
			`@/features/layout/components/icon-rail?goto-registration=${Math.random().toString(36).slice(2)}`
		);
		renderToStaticMarkup(<IconRail />);

		expect(new Set(registeredDestinations)).toEqual(
			new Set([
				"route.notes",
				"route.journal",
				"route.graph",
				"route.tasks",
				"route.tags",
				"route.people",
				"route.activity",
				"route.trash",
			]),
		);
	});
});
