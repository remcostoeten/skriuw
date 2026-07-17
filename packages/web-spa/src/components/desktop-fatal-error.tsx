import { Component, type ErrorInfo, type ReactNode, useState } from "react";
import { BootSplashController } from "./boot-splash-controller";

/**
 * Minimal Tauri IPC probe that avoids importing the workspace-backend feature
 * tree, so this recovery view still renders when feature chunks fail to load.
 */
type TauriCore = { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
type TauriGlobal = { __TAURI__?: { core?: TauriCore } };

function tauriInvoke(command: string): Promise<unknown> | null {
	if (typeof window === "undefined") return null;
	const core = (window as TauriGlobal).__TAURI__?.core;
	if (!core?.invoke) return null;
	return core.invoke(command);
}

/** Fields safe to copy: no note bodies, keys, tokens, or full filesystem paths. */
function buildDiagnostics(error: Error): string {
	const lines = [
		`Skriuw desktop diagnostics`,
		`time: ${new Date().toISOString()}`,
		`route: ${typeof window !== "undefined" ? window.location.hash || "(none)" : "(n/a)"}`,
		`userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "(n/a)"}`,
		`error: ${error.name}: ${error.message}`,
	];
	return lines.join("\n");
}

export function FatalErrorView({ error, onRetry }: { error: Error; onRetry: () => void }) {
	const [copied, setCopied] = useState(false);
	const [revealDisabled, setRevealDisabled] = useState(false);
	const ipcAvailable = tauriInvoke("app_info") !== null;

	function handleReveal() {
		const call = tauriInvoke("reveal_vault");
		if (!call) {
			setRevealDisabled(true);
			return;
		}
		void call.catch(() => setRevealDisabled(true));
	}

	function handleCopy() {
		const text = buildDiagnostics(error);
		void navigator.clipboard
			?.writeText(text)
			.then(() => setCopied(true))
			.catch(() => setCopied(false));
	}

	return (
		<div
			role="alert"
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "#0b0f17",
				color: "#e5e7eb",
				fontFamily: "system-ui, sans-serif",
				padding: "2rem",
			}}
		>
			<BootSplashController />
			<div style={{ maxWidth: "28rem", textAlign: "center" }}>
				<h1 tabIndex={-1} style={{ fontSize: "1.05rem", margin: "0 0 0.5rem" }}>
					Skriuw hit an unexpected error
				</h1>
				<p style={{ fontSize: "0.85rem", opacity: 0.7, margin: "0 0 1.25rem" }}>
					Your notes are stored as Markdown files on this device and are unaffected. Try
					one of the actions below.
				</p>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: "0.5rem",
						justifyContent: "center",
					}}
				>
					<button type="button" onClick={onRetry} style={buttonStyle}>
						Try again
					</button>
					<button
						type="button"
						onClick={() => window.location.reload()}
						style={buttonStyle}
					>
						Reload Skriuw
					</button>
					{ipcAvailable && !revealDisabled ? (
						<button type="button" onClick={handleReveal} style={buttonStyle}>
							Reveal vault folder
						</button>
					) : null}
					<button type="button" onClick={handleCopy} style={buttonStyle}>
						{copied ? "Diagnostics copied" : "Copy diagnostics"}
					</button>
				</div>
				{!ipcAvailable ? (
					<p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: "1rem" }}>
						The desktop app-shell connection is unavailable, so vault access is
						disabled.
					</p>
				) : null}
				<details style={{ marginTop: "1.25rem", textAlign: "left" }}>
					<summary style={{ fontSize: "0.75rem", opacity: 0.6, cursor: "pointer" }}>
						Technical details
					</summary>
					<pre
						style={{
							fontSize: "0.7rem",
							opacity: 0.6,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							marginTop: "0.5rem",
						}}
					>
						{error.name}: {error.message}
					</pre>
				</details>
			</div>
		</div>
	);
}

const buttonStyle: React.CSSProperties = {
	border: "1px solid #374151",
	background: "transparent",
	color: "#e5e7eb",
	borderRadius: "0.375rem",
	padding: "0.45rem 0.9rem",
	fontSize: "0.85rem",
	cursor: "pointer",
};

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Import-light React error barrier placed OUTSIDE `RouterProvider`, so a failure
 * while constructing the providers or router — which the router's own
 * `errorComponent` cannot catch — still lands on a recoverable screen instead of
 * a blank window. Retry resets the barrier once.
 */
export class DesktopFatalErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[skriuw] fatal shell error", error, info.componentStack);
	}

	handleRetry = () => {
		this.setState({ error: null });
	};

	render() {
		if (this.state.error) {
			return <FatalErrorView error={this.state.error} onRetry={this.handleRetry} />;
		}
		return this.props.children;
	}
}
