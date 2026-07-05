"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFpsMeter, type FpsSample } from "./fps-meter";
import { trackRenders, type CommitEvent } from "./fiber-render-tracker";
import { RenderOverlay } from "./render-overlay";

type RenderStats = {
	count: number;
	selfTimeMs: number;
	windowCount: number;
};

type LogEntry = {
	id: number;
	at: string;
	kind: "drop" | "render";
	message: string;
};

const HEAT_WINDOW_MS = 2_000;
const LOG_LIMIT = 40;
const SPARKLINE_POINTS = 60;
const NOISY_RENDERS_PER_WINDOW = 8;

function timestamp(): string {
	return new Date().toLocaleTimeString(undefined, { hour12: false });
}

function formatMs(value: number): string {
	return value >= 10 ? `${Math.round(value)}ms` : `${value.toFixed(1)}ms`;
}

const panelStyle: React.CSSProperties = {
	position: "fixed",
	right: 12,
	bottom: 12,
	zIndex: 2147483647,
	width: 320,
	maxHeight: "min(60vh, 520px)",
	display: "flex",
	flexDirection: "column",
	gap: 8,
	padding: 12,
	borderRadius: 14,
	border: "1px solid var(--border, rgba(127,127,127,0.25))",
	background: "color-mix(in srgb, var(--popover, var(--background, #111)) 92%, transparent)",
	color: "var(--popover-foreground, var(--foreground, #eee))",
	backdropFilter: "blur(12px)",
	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
	fontSize: 11,
	lineHeight: 1.45,
	boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
	transition: "opacity 160ms ease, transform 160ms ease",
};

function fpsColor(fps: number): string {
	if (fps >= 55) return "var(--devtools-ok, hsl(150 70% 45%))";
	if (fps >= 45) return "var(--devtools-warn, hsl(40 90% 55%))";
	return "var(--devtools-bad, hsl(0 85% 60%))";
}

function Sparkline({ history }: { history: number[] }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext("2d");
		if (!canvas || !context) return;
		const scale = window.devicePixelRatio || 1;
		canvas.width = 120 * scale;
		canvas.height = 28 * scale;
		context.setTransform(scale, 0, 0, scale, 0, 0);
		context.clearRect(0, 0, 120, 28);

		context.beginPath();
		history.forEach((fps, index) => {
			const x = (index / (SPARKLINE_POINTS - 1)) * 120;
			const y = 28 - Math.min(1, fps / 60) * 26 - 1;
			if (index === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		});
		const latest = history[history.length - 1] ?? 60;
		context.strokeStyle =
			latest >= 55 ? "hsl(150 70% 45%)" : latest >= 45 ? "hsl(40 90% 55%)" : "hsl(0 85% 60%)";
		context.lineWidth = 1.5;
		context.stroke();
	}, [history]);

	return <canvas ref={canvasRef} style={{ width: 120, height: 28 }} aria-hidden />;
}

/**
 * Floating performance HUD: realtime FPS with sparkline and drop badges, a
 * live "top re-renderers" table, an optional on-page render-flash overlay,
 * and a human-readable event log. Project-agnostic — themes itself from the
 * host app's CSS variables (--popover, --border, --foreground) with neutral
 * fallbacks.
 */
export function PerfHud({ onClose }: { onClose: () => void }) {
	const [fps, setFps] = useState(60);
	const [history, setHistory] = useState<number[]>([]);
	const [paused, setPaused] = useState(false);
	const [overlayOn, setOverlayOn] = useState(true);
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [statsVersion, setStatsVersion] = useState(0);
	const [hookMissing, setHookMissing] = useState(false);

	const statsRef = useRef(new Map<string, RenderStats>());
	const pausedRef = useRef(false);
	const logIdRef = useRef(0);
	const commitListenersRef = useRef(new Set<(commit: CommitEvent) => void>());
	pausedRef.current = paused;

	const pushLog = useCallback((kind: LogEntry["kind"], message: string) => {
		setLogs((current) =>
			[{ id: ++logIdRef.current, at: timestamp(), kind, message }, ...current].slice(
				0,
				LOG_LIMIT,
			),
		);
	}, []);

	useEffect(() => {
		const meter = createFpsMeter();
		meter.subscribe(
			(sample: FpsSample) => {
				if (pausedRef.current) return;
				setFps(sample.fps);
				setHistory((current) => [...current, sample.fps].slice(-SPARKLINE_POINTS));
			},
			(drop) => {
				if (pausedRef.current) return;
				pushLog(
					"drop",
					`FPS dropped to ${drop.fps} — worst frame ${formatMs(drop.worstFrameMs)}`,
				);
			},
		);
		return () => meter.stop();
	}, [pushLog]);

	useEffect(() => {
		const windowCounts = new Map<string, { count: number; since: number }>();

		const unsubscribe = trackRenders((commit) => {
			if (pausedRef.current) return;
			for (const listener of commitListenersRef.current) listener(commit);

			const now = performance.now();
			for (const render of commit.renders) {
				const stats = statsRef.current.get(render.name) ?? {
					count: 0,
					selfTimeMs: 0,
					windowCount: 0,
				};
				stats.count += 1;
				stats.selfTimeMs += render.selfTimeMs;

				const rolling = windowCounts.get(render.name) ?? { count: 0, since: now };
				if (now - rolling.since > HEAT_WINDOW_MS) {
					rolling.count = 0;
					rolling.since = now;
				}
				rolling.count += 1;
				windowCounts.set(render.name, rolling);
				stats.windowCount = rolling.count;
				statsRef.current.set(render.name, stats);

				if (rolling.count === NOISY_RENDERS_PER_WINDOW) {
					pushLog(
						"render",
						`${render.name} re-rendered ${rolling.count}× in ${(HEAT_WINDOW_MS / 1000).toFixed(0)}s (${formatMs(stats.selfTimeMs)} self total) — check its props/context`,
					);
				}
			}
			setStatsVersion((v) => v + 1);
		});

		if (!unsubscribe) {
			setHookMissing(true);
			return;
		}
		return unsubscribe;
	}, [pushLog]);

	const subscribeCommits = useCallback((listener: (commit: CommitEvent) => void) => {
		commitListenersRef.current.add(listener);
		return () => {
			commitListenersRef.current.delete(listener);
		};
	}, []);

	const heatFor = useCallback((name: string) => {
		const stats = statsRef.current.get(name);
		return stats ? Math.min(1, stats.windowCount / NOISY_RENDERS_PER_WINDOW) : 0;
	}, []);

	const topRenderers = useMemo(() => {
		void statsVersion;
		return [...statsRef.current.entries()]
			.sort((left, right) => right[1].count - left[1].count)
			.slice(0, 8);
	}, [statsVersion]);

	function clearStats() {
		statsRef.current.clear();
		setLogs([]);
		setStatsVersion((v) => v + 1);
	}

	return (
		<>
			{overlayOn && !hookMissing ? (
				<RenderOverlay commits={subscribeCommits} heatFor={heatFor} />
			) : null}
			<div style={panelStyle} role="status" aria-label="Performance HUD">
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<span
						style={{
							fontSize: 22,
							fontWeight: 600,
							fontVariantNumeric: "tabular-nums",
							color: fpsColor(fps),
							transition: "color 200ms ease",
						}}
					>
						{fps}
						<span style={{ fontSize: 10, opacity: 0.6, marginLeft: 3 }}>fps</span>
					</span>
					<Sparkline history={history} />
					<div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
						<HudButton
							label={overlayOn ? "flash on" : "flash off"}
							active={overlayOn}
							onClick={() => setOverlayOn((v) => !v)}
						/>
						<HudButton
							label={paused ? "resume" : "pause"}
							active={!paused}
							onClick={() => setPaused((v) => !v)}
						/>
						<HudButton label="clear" onClick={clearStats} />
						<HudButton label="×" onClick={onClose} />
					</div>
				</div>

				{hookMissing ? (
					<div style={{ opacity: 0.7 }}>
						Render tracking unavailable: the devtools hook wasn&apos;t installed before
						React loaded. Import <code>installDevtoolsHookStub</code> earlier in the
						entry module (FPS metering still works).
					</div>
				) : (
					<div>
						<div style={{ opacity: 0.55, marginBottom: 4, letterSpacing: 0.4 }}>
							TOP RE-RENDERERS
						</div>
						{topRenderers.length === 0 ? (
							<div style={{ opacity: 0.5 }}>
								interact with the app to collect renders…
							</div>
						) : (
							topRenderers.map(([name, stats]) => (
								<div
									key={name}
									style={{
										display: "flex",
										gap: 8,
										alignItems: "baseline",
										padding: "1px 0",
									}}
								>
									<span
										style={{
											width: 6,
											height: 6,
											borderRadius: 3,
											flexShrink: 0,
											alignSelf: "center",
											background: `hsl(${160 - heatFor(name) * 160} 90% 55%)`,
											transition: "background 300ms ease",
										}}
									/>
									<span
										style={{
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											flex: 1,
										}}
									>
										{name}
									</span>
									<span
										style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}
									>
										{stats.count}× · {formatMs(stats.selfTimeMs)}
									</span>
								</div>
							))
						)}
					</div>
				)}

				<div style={{ overflowY: "auto", minHeight: 0 }}>
					<div style={{ opacity: 0.55, marginBottom: 4, letterSpacing: 0.4 }}>EVENTS</div>
					{logs.length === 0 ? (
						<div style={{ opacity: 0.5 }}>
							no drops or noisy renders yet — good sign
						</div>
					) : (
						logs.map((log) => (
							<div key={log.id} style={{ display: "flex", gap: 6, padding: "1px 0" }}>
								<span style={{ opacity: 0.45, flexShrink: 0 }}>{log.at}</span>
								<span
									style={{
										color:
											log.kind === "drop"
												? "var(--devtools-bad, hsl(0 85% 60%))"
												: "var(--devtools-warn, hsl(40 90% 55%))",
									}}
								>
									{log.message}
								</span>
							</div>
						))
					)}
				</div>
			</div>
		</>
	);
}

function HudButton({
	label,
	onClick,
	active,
}: {
	label: string;
	onClick: () => void;
	active?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				border: "1px solid var(--border, rgba(127,127,127,0.25))",
				background: active
					? "color-mix(in srgb, var(--foreground, #eee) 12%, transparent)"
					: "transparent",
				color: "inherit",
				borderRadius: 7,
				padding: "2px 7px",
				fontSize: 10,
				fontFamily: "inherit",
				cursor: "pointer",
				transition: "background 140ms ease",
			}}
		>
			{label}
		</button>
	);
}
