import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopRouteError, DesktopRouteLoading } from "./route-state";

describe("desktop route states", () => {
	test("renders a deterministic accessible loading state", () => {
		const html = renderToStaticMarkup(<DesktopRouteLoading />);
		expect(html).toContain('role="status"');
		expect(html).toContain("Loading workspace");
	});

	test("renders recovery copy for a route import failure with collapsible details", () => {
		const html = renderToStaticMarkup(
			<DesktopRouteError
				error={new Error("lazy route failed")}
				reset={() => undefined}
				info={{ componentStack: "" }}
			/>,
		);
		expect(html).toContain('role="alert"');
		// The raw error is behind a details/summary, not the primary message.
		expect(html).toContain("Technical details");
		expect(html).toContain("lazy route failed");
		expect(html).toContain("Try again");
	});
});
