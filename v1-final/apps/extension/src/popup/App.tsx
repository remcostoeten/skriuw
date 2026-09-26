import { useEffect, useState } from "react";
import { listActivity, listFolders, verifyToken } from "../shared/api";
import { getSettings, saveCapturePreferences } from "../shared/storage";
import type {
	TExtractResult,
	TFolderSummary,
	TSyncEventSummary,
	TTokenInfo,
} from "../shared/types";
import { EXTENSION_VERSION } from "../shared/version";

const EXPIRY_WARNING_DAYS = 7;
const SHORT_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

function daysUntil(iso: string | null): number | null {
	if (!iso) return null;
	return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

type TStatus =
	| { phase: "loading" }
	| { phase: "no-token" }
	| { phase: "ready" }
	| { phase: "saving" }
	| { phase: "saved"; path: string }
	| { phase: "queued" }
	| { phase: "error"; message: string };

export function App() {
	const [extracted, setExtracted] = useState<TExtractResult | null>(null);
	const [title, setTitle] = useState("");
	const [tags, setTags] = useState("");
	const [apiBase, setApiBase] = useState("https://skriuw.app");
	const [folders, setFolders] = useState<TFolderSummary[]>([]);
	const [parentId, setParentId] = useState<string | null>(null);
	const [openAfterSave, setOpenAfterSave] = useState(false);
	const [activity, setActivity] = useState<TSyncEventSummary[]>([]);
	const [tokenInfo, setTokenInfo] = useState<TTokenInfo | null>(null);
	const [status, setStatus] = useState<TStatus>({ phase: "loading" });
	const folderOptions = buildFolderOptions(folders);

	useEffect(() => {
		(async () => {
			const settings = await getSettings();
			setApiBase(settings.apiBase);
			setParentId(settings.parentId);
			setOpenAfterSave(settings.openAfterSave);
			if (!settings.token) {
				setStatus({ phase: "no-token" });
				return;
			}
			const info = await verifyToken().catch(() => null);
			if (!info) {
				setStatus({ phase: "no-token" });
				return;
			}
			setTokenInfo(info);
			void listFolders()
				.then(setFolders)
				.catch(() => setFolders([]));
			void listActivity()
				.then(setActivity)
				.catch(() => setActivity([]));
			const result = (await chrome.runtime.sendMessage({
				type: "extract",
				kind: "article",
			})) as TExtractResult | null;
			if (!result) {
				setStatus({ phase: "error", message: "Could not read this page." });
				return;
			}
			setExtracted(result);
			setTitle(result.title);
			setTags(result.tags.join(", "));
			setStatus({ phase: "ready" });
		})();
	}, []);

	async function handleSave() {
		if (!extracted) return;
		setStatus({ phase: "saving" });
		await saveCapturePreferences({ parentId, openAfterSave });
		const tagList = tags.split(",").flatMap((tag) => {
			const trimmed = tag.trim();
			return trimmed ? [trimmed] : [];
		});
		const result = (await chrome.runtime.sendMessage({
			type: "clip",
			kind: extracted.kind,
			extra: { title, tags: tagList, parentId },
		})) as { ok: boolean; error?: string; queued?: boolean; path?: string };

		if (result.ok && result.queued) setStatus({ phase: "queued" });
		else if (result.ok) {
			setStatus({ phase: "saved", path: result.path ?? "" });
			void listActivity()
				.then(setActivity)
				.catch(() => undefined);
			if (openAfterSave && result.path) {
				void chrome.tabs.create({ url: `${apiBase}${result.path}` });
			}
		} else setStatus({ phase: "error", message: result.error ?? "Save failed." });
	}

	function openSavedNote() {
		if (status.phase !== "saved" || !status.path) return;
		void chrome.tabs.create({ url: `${apiBase}${status.path}` });
	}

	if (status.phase === "no-token") {
		return (
			<main className="shell">
				<header className="header">
					<div className="brand">
						<img src="/icons/icon-48.png" alt="" className="logo" />
						<div>
							<p className="eyebrow">Skriuw</p>
							<h1>Web Clipper</h1>
						</div>
					</div>
				</header>
				<section className="panel empty">
					<p>Connect the extension to your Skriuw account first.</p>
					<button type="button" onClick={() => chrome.runtime.openOptionsPage()}>
						Open settings
					</button>
				</section>
				<FooterBar />
			</main>
		);
	}

	if (status.phase === "loading") {
		return (
			<main className="shell">
				<section className="panel empty">
					<p>Reading page...</p>
				</section>
				<FooterBar />
			</main>
		);
	}

	return (
		<main className="shell">
			<header className="header">
				<div className="brand">
					<img src="/icons/icon-48.png" alt="" className="logo" />
					<div>
						<p className="eyebrow">Skriuw</p>
						<h1>Save clip</h1>
					</div>
				</div>
				<button
					type="button"
					className="icon-button"
					title="Extension settings"
					onClick={() => chrome.runtime.openOptionsPage()}
				>
					Settings
				</button>
			</header>

			{tokenExpiryWarning(tokenInfo) && (
				<div className="status error" style={{ margin: "0 0 8px" }}>
					{tokenExpiryWarning(tokenInfo)}
				</div>
			)}

			<section className="panel">
				<label htmlFor="title">Title</label>
				<input
					id="title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
				/>
				<div className="url">{extracted?.url}</div>

				<label htmlFor="tags">Tags</label>
				<input
					id="tags"
					value={tags}
					onChange={(event) => setTags(event.target.value)}
					placeholder="research, ideas"
				/>

				<label htmlFor="folder">Destination</label>
				<select
					id="folder"
					value={parentId ?? ""}
					onChange={(event) => setParentId(event.target.value || null)}
				>
					<option value="">Workspace root</option>
					{folderOptions.map((folder) => (
						<option key={folder.id} value={folder.id}>
							{folder.label}
						</option>
					))}
				</select>

				<label className="check-row">
					<input
						type="checkbox"
						checked={openAfterSave}
						onChange={(event) => setOpenAfterSave(event.target.checked)}
					/>
					Open note after save
				</label>

				<label htmlFor="preview">Preview</label>
				<div id="preview" className="preview">
					{extracted?.markdown.slice(0, 400) || "-"}
				</div>

				<button type="button" onClick={handleSave} disabled={status.phase === "saving"}>
					{status.phase === "saving" ? "Saving..." : "Save to Skriuw"}
				</button>

				{status.phase === "saved" && <div className="status ok">Saved</div>}
				{status.phase === "saved" && status.path && (
					<button type="button" className="secondary-button" onClick={openSavedNote}>
						Open note
					</button>
				)}
				{status.phase === "queued" && (
					<div className="status ok">Offline. Queued for retry.</div>
				)}
				{status.phase === "error" && <div className="status error">{status.message}</div>}
			</section>

			{activity.length > 0 && (
				<section className="activity" aria-label="Recent sync activity">
					<div className="activity-title">Recent syncs</div>
					{activity.slice(0, 4).map((event) => (
						<div key={event.id} className="activity-item">
							<span>{event.resourceName ?? event.operation}</span>
							<time dateTime={event.createdAt}>
								{formatShortTime(event.createdAt)}
							</time>
						</div>
					))}
				</section>
			)}

			<div className="endpoint">{apiBase}</div>
			<FooterBar />
		</main>
	);
}

function tokenExpiryWarning(tokenInfo: TTokenInfo | null): string | null {
	const days = daysUntil(tokenInfo?.expiresAt ?? null);
	if (days === null || days > EXPIRY_WARNING_DAYS) return null;
	if (days <= 0) return "This key has expired. Reconnect in Settings.";
	return `This key expires in ${days} day${days === 1 ? "" : "s"}. Rotate it in Skriuw settings.`;
}

function formatShortTime(value: string): string {
	return SHORT_TIME_FORMATTER.format(new Date(value));
}

function buildFolderOptions(folders: TFolderSummary[]): Array<{ id: string; label: string }> {
	const byParent = new Map<string, TFolderSummary[]>();
	for (const folder of folders) {
		const key = folder.parentId ?? "root";
		byParent.set(key, [...(byParent.get(key) ?? []), folder]);
	}
	for (const siblings of byParent.values()) {
		siblings.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
	}

	const options: Array<{ id: string; label: string }> = [];
	const visit = (parentId: string | null, depth: number) => {
		for (const folder of byParent.get(parentId ?? "root") ?? []) {
			options.push({ id: folder.id, label: `${"  ".repeat(depth)}${folder.name}` });
			visit(folder.id, depth + 1);
		}
	};
	visit(null, 0);
	return options;
}

function FooterBar() {
	return (
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
	);
}
