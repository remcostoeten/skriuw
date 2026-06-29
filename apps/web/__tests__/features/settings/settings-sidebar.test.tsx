import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/link", () => ({
	default: ({
		children,
		href,
		className,
	}: {
		children: React.ReactNode;
		href: string;
		className?: string;
	}) => (
		<a href={href} className={className}>
			{children}
		</a>
	),
}));

mock.module("@/core/auth/use-auth", () => ({
	useAuth: () => ({ user: { role: "user" } }),
}));

mock.module("@/core/workspace-backend", () => ({
	isTauriRuntime: () => false,
}));

describe("SettingsSidebar", () => {
	test("keeps every settings section reachable in the Tab order", async () => {
		const { SettingsSidebar } = await import(
			`@/features/settings/components/settings-sidebar?test=${Math.random().toString(36).slice(2)}`
		);

		const html = renderToStaticMarkup(
			<SettingsSidebar activeTab="account" onSelectTab={() => {}} />,
		);

		expect(html.match(/role="tab"/g)).toHaveLength(10);
		expect(html.match(/tabindex="0"/g)).toHaveLength(10);
		expect(html).not.toContain('tabindex="-1"');
	});
});
