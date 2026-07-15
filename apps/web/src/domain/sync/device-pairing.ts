const DESKTOP_CLIENT_ID = "skriuw-desktop";

export type DesktopPairingRequest = {
	serverUrl: string;
	deviceCode: string;
	userCode: string;
	verificationUrl: string;
	expiresAt: number;
	pollIntervalMs: number;
};

export type DesktopPairingResult = {
	token: string;
	account: { name: string; email: string; image: string | null };
};

function normalizedServerUrl(serverUrl: string): string {
	const url = new URL(serverUrl.trim());
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("The sync server must use http or https.");
	}
	return url.origin;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
	const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
	if (!response.ok && typeof json.error !== "string") {
		throw new Error("The sync server returned an unexpected response.");
	}
	return json;
}

export async function beginDesktopPairing(serverUrl: string): Promise<DesktopPairingRequest> {
	const origin = normalizedServerUrl(serverUrl);
	const response = await fetch(`${origin}/api/sync/device/code`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
	});
	const json = await readJson(response);
	if (!response.ok) throw new Error(String(json.error));

	const deviceCode = json.device_code;
	const userCode = json.user_code;
	const verificationUrl = json.verification_uri_complete;
	if (
		typeof deviceCode !== "string" ||
		typeof userCode !== "string" ||
		typeof verificationUrl !== "string"
	) {
		throw new Error("The sync server did not return a valid sign-in request.");
	}
	const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 600;
	const interval = typeof json.interval === "number" ? json.interval : 5;

	return {
		serverUrl: origin,
		deviceCode,
		userCode,
		verificationUrl: new URL(verificationUrl, origin).toString(),
		expiresAt: Date.now() + expiresIn * 1000,
		pollIntervalMs: Math.max(interval, 1) * 1000,
	};
}

export async function openDesktopPairingPage(url: string): Promise<void> {
	if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
		const { openUrl } = await import("@tauri-apps/plugin-opener");
		await openUrl(url);
		return;
	}
	window.open(url, "_blank", "noopener,noreferrer");
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(new DOMException("Cancelled", "AbortError"));
		const timer = globalThis.setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				globalThis.clearTimeout(timer);
				reject(new DOMException("Cancelled", "AbortError"));
			},
			{ once: true },
		);
	});
}

export async function finishDesktopPairing(
	request: DesktopPairingRequest,
	signal?: AbortSignal,
): Promise<DesktopPairingResult> {
	let intervalMs = request.pollIntervalMs;
	while (Date.now() < request.expiresAt) {
		await wait(intervalMs, signal);
		const response = await fetch(`${request.serverUrl}/api/sync/device/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ deviceCode: request.deviceCode, clientId: DESKTOP_CLIENT_ID }),
			signal,
		});
		const json = await readJson(response);
		if (!response.ok) {
			if (json.error === "authorization_pending") continue;
			if (json.error === "slow_down") {
				intervalMs += 5_000;
				continue;
			}
			throw new Error(
				typeof json.error_description === "string"
					? json.error_description
					: "Desktop sign-in was not approved.",
			);
		}

		const accessToken = json.access_token;
		if (typeof accessToken !== "string") throw new Error("Sign-in returned no access token.");
		const exchange = await fetch(`${request.serverUrl}/api/sync/device/exchange`, {
			method: "POST",
			headers: { Authorization: `Bearer ${accessToken}` },
			signal,
		});
		const credentials = await readJson(exchange);
		if (!exchange.ok) throw new Error(String(credentials.error));
		if (typeof credentials.token !== "string" || !credentials.account) {
			throw new Error("The desktop credential could not be created.");
		}
		return credentials as DesktopPairingResult;
	}
	throw new Error("The sign-in request expired. Start again to reconnect.");
}

export async function revokeDesktopCredential(serverUrl: string, token: string): Promise<void> {
	await fetch(`${normalizedServerUrl(serverUrl)}/api/sync/device/disconnect`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
	}).catch(() => undefined);
}
