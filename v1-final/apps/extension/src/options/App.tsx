import { useEffect, useState } from "react";
import { verifyRawToken } from "../shared/api";
import { getSettings, saveSettings } from "../shared/storage";
import type { TTokenInfo } from "../shared/types";
import { EXTENSION_VERSION } from "../shared/version";

const EXPIRY_WARNING_DAYS = 7;

type TStatus =
	| { phase: "idle" }
	| { phase: "testing" }
	| { phase: "ok"; message: string }
	| { phase: "error"; message: string };

function daysUntil(iso: string | null): number | null {
	if (!iso) return null;
	return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function App() {
	const [apiBase, setApiBase] = useState("https://skriuw.app");
	const [token, setToken] = useState("");
	const [status, setStatus] = useState<TStatus>({ phase: "idle" });
	const [tokenInfo, setTokenInfo] = useState<TTokenInfo | null>(null);

	useEffect(() => {
		(async () => {
			const settings = await getSettings();
			setApiBase(settings.apiBase);
			setToken(settings.token);
			if (settings.token) {
				await verifyRawToken(settings.apiBase, settings.token)
					.then(setTokenInfo)
					.catch(() => setTokenInfo(null));
			}
		})();
	}, []);

	async function handleTestAndSave() {
		setStatus({ phase: "testing" });
		setTokenInfo(null);
		const base = apiBase.trim().replace(/\/$/, "");
		const secret = token.trim();
		try {
			const info = await verifyRawToken(base, secret);
			if (!info.canWrite) {
				setStatus({
					phase: "error",
					message: "This key is read-only. Create a key with extension capture access.",
				});
				return;
			}
			const current = await getSettings();
			await saveSettings({
				...current,
				apiBase: base,
				token: secret,
			});
			setTokenInfo(info);
			setStatus({ phase: "ok", message: "Saved. You're ready to clip." });
		} catch (error) {
			setStatus({
				phase: "error",
				message: error instanceof Error ? error.message : "Could not reach the API.",
			});
		}
	}

	const expiryDays = daysUntil(tokenInfo?.expiresAt ?? null);

	return (
		<main className="page">
			<header className="hero">
				<div className="brand">
					<img src="/icons/icon-48.png" alt="" className="logo" />
					<div>
						<p className="eyebrow">Skriuw</p>
						<h1>Web Clipper settings</h1>
					</div>
				</div>
				<p>
					Create an Extension capture key in Skriuw, then paste it below to save pages and
					selections from Chrome.
				</p>
			</header>

			<section className="panel">
				<label htmlFor="apiBase">API base URL</label>
				<input
					id="apiBase"
					value={apiBase}
					onChange={(event) => setApiBase(event.target.value)}
					placeholder="https://skriuw.app"
				/>
				<div className="hint">
					Requests go to <code>{apiBase.replace(/\/$/, "")}/api/sync/capture</code>.
				</div>

				<label htmlFor="token">Extension capture key</label>
				<input
					id="token"
					type="password"
					value={token}
					onChange={(event) => setToken(event.target.value)}
					placeholder="skriuw_sync_..."
				/>

				<div className="actions">
					<button
						type="button"
						onClick={handleTestAndSave}
						disabled={status.phase === "testing" || !token}
					>
						{status.phase === "testing" ? "Checking..." : "Test & save"}
					</button>
				</div>

				{status.phase === "ok" && <div className="status ok">{status.message}</div>}
				{status.phase === "error" && <div className="status error">{status.message}</div>}

				{tokenInfo && (
					<div className="hint" style={{ marginTop: 12 }}>
						<div>
							<strong>{tokenInfo.name}</strong> ·{" "}
							{tokenInfo.canWrite ? "Capture + sync" : "Read only"}
						</div>
						<div>
							Expires:{" "}
							{tokenInfo.expiresAt
								? new Date(tokenInfo.expiresAt).toLocaleDateString()
								: "Never"}
						</div>
						{expiryDays !== null && expiryDays <= EXPIRY_WARNING_DAYS && (
							<div className="status error" style={{ marginTop: 6 }}>
								{expiryDays <= 0
									? "This key has expired. Generate a new one in Skriuw settings."
									: `This key expires in ${expiryDays} day${expiryDays === 1 ? "" : "s"}. Rotate it in Skriuw settings.`}
							</div>
						)}
					</div>
				)}
			</section>

			<footer className="footer">
				<a href="https://skriuw.app" target="_blank" rel="noreferrer">
					Skriuw
				</a>
				<span aria-hidden="true">/</span>
				<a href="https://github.com/remcostoeten/skriuw" target="_blank" rel="noreferrer">
					GitHub
				</a>
				<span aria-hidden="true">/</span>
				<span className="version">v{EXTENSION_VERSION}</span>
			</footer>
		</main>
	);
}
