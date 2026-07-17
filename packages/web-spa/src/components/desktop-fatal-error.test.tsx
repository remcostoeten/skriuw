import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopFatalErrorBoundary, FatalErrorView } from "./desktop-fatal-error";

describe("desktop fatal error boundary", () => {
	test("renders children when nothing throws", () => {
		const html = renderToStaticMarkup(
			<DesktopFatalErrorBoundary>
				<p>workspace</p>
			</DesktopFatalErrorBoundary>,
		);
		expect(html).toContain("workspace");
		expect(html).not.toContain("unexpected error");
	});

	test("recovery view offers offline-safe actions and hides raw error", () => {
		const html = renderToStaticMarkup(
			<FatalErrorView
				error={new Error("provider construction failed")}
				onRetry={() => undefined}
			/>,
		);
		expect(html).toContain('role="alert"');
		expect(html).toContain("unexpected error");
		expect(html).toContain("Try again");
		expect(html).toContain("Reload Skriuw");
		expect(html).toContain("Copy diagnostics");
		// The raw error is disclosed behind details, and the notes-are-safe
		// reassurance is present so recovery reads as non-destructive.
		expect(html).toContain("Technical details");
		expect(html).toContain("Markdown files");
	});
});
