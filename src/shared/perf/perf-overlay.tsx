"use client";

import { useEffect, useState } from "react";
import {
	clearSamples,
	getHeadline,
	getSummaryRows,
	isPerfEnabled,
	type TPerfHeadline,
	type TPerfSummary,
} from "./track";

/**
 * Dev-only on-screen panel that shows live interaction-perf numbers (warm/cold
 * note-open latency + serialize cost) without needing the console. Polls the
 * tracker twice a second. Renders nothing unless tracking is enabled, so it is
 * free in production. Collapsible; starts collapsed to a small pill.
 */
export function PerfOverlay() {
	const [rows, setRows] = useState<Record<string, TPerfSummary>>({});
	const [head, setHead] = useState<TPerfHeadline | null>(null);
	const [open, setOpen] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		if (!isPerfEnabled()) return;
		const tick = () => {
			setRows(getSummaryRows());
			setHead(getHeadline());
		};
		tick();
		const id = window.setInterval(tick, 500);
		return () => window.clearInterval(id);
	}, []);

	if (!mounted || !isPerfEnabled()) return null;

	const entries = Object.entries(rows);

	return (
		<div
			style={{
				position: "fixed",
				bottom: 12,
				right: 12,
				zIndex: 2147483647,
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: 11,
				color: "#e5e7eb",
				pointerEvents: "auto",
			}}
		>
			{open ? (
				<div
					style={{
						background: "rgba(17,17,19,0.92)",
						border: "1px solid rgba(255,255,255,0.12)",
						borderRadius: 8,
						padding: "8px 10px",
						minWidth: 280,
						boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
						backdropFilter: "blur(6px)",
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 6,
						}}
					>
						<strong style={{ fontWeight: 600 }}>skriuw perf · ms</strong>
						<span style={{ display: "flex", gap: 8 }}>
							<button
								type="button"
								onClick={() => {
									clearSamples();
									setRows({});
								}}
								style={btnStyle}
							>
								clear
							</button>
							<button type="button" onClick={() => setOpen(false)} style={btnStyle}>
								×
							</button>
						</span>
					</div>
					{head && (
						<div
							style={{
								display: "flex",
								flexWrap: "wrap",
								gap: "4px 12px",
								marginBottom: 8,
								paddingBottom: 8,
								borderBottom: "1px solid rgba(255,255,255,0.08)",
							}}
						>
							<span style={{ color: verdictColor(head.verdict), fontWeight: 600 }}>
								{head.verdict}
							</span>
							<span>
								cache-hit{" "}
								<b style={{ color: hitColor(head.cacheHitRate) }}>
									{head.cacheHitRate === null ? "—" : `${head.cacheHitRate}%`}
								</b>{" "}
								<span style={{ opacity: 0.55 }}>
									({head.warmCount}w/{head.coldCount}c)
								</span>
							</span>
							<span>
								worst-INP{" "}
								<b style={{ color: tint("interaction", head.worstInteraction) }}>
									{head.worstInteraction}ms
								</b>
							</span>
							<span>
								long-tasks{" "}
								<b style={{ color: head.longTaskCount > 0 ? "#fbbf24" : "#4ade80" }}>
									{head.longTaskCount}
								</b>
							</span>
						</div>
					)}
					{entries.length === 0 ? (
						<div style={{ opacity: 0.6 }}>Click between notes / type to collect samples…</div>
					) : (
						<table style={{ borderCollapse: "collapse", width: "100%" }}>
							<thead>
								<tr style={{ opacity: 0.6, textAlign: "right" }}>
									<th style={{ textAlign: "left", paddingRight: 8 }}>metric</th>
									<th style={cellStyle}>n</th>
									<th style={cellStyle}>p50</th>
									<th style={cellStyle}>p95</th>
									<th style={cellStyle}>max</th>
								</tr>
							</thead>
							<tbody>
								{entries.map(([metric, s]) => (
									<tr key={metric}>
										<td style={{ paddingRight: 8, whiteSpace: "nowrap" }}>{metric}</td>
										<td style={cellStyle}>{s.count}</td>
										<td style={{ ...cellStyle, color: tint(metric, s.p50) }}>{s.p50}</td>
										<td style={{ ...cellStyle, color: tint(metric, s.p95) }}>{s.p95}</td>
										<td style={cellStyle}>{s.max}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			) : (
				<button
					type="button"
					onClick={() => setOpen(true)}
					style={{
						...btnStyle,
						background: "rgba(17,17,19,0.92)",
						border: "1px solid rgba(255,255,255,0.12)",
						borderRadius: 999,
						padding: "4px 10px",
					}}
				>
					⚡ perf
				</button>
			)}
		</div>
	);
}

const btnStyle: React.CSSProperties = {
	background: "transparent",
	border: "none",
	color: "#e5e7eb",
	cursor: "pointer",
	fontFamily: "inherit",
	fontSize: 11,
	padding: 0,
};

const cellStyle: React.CSSProperties = {
	textAlign: "right",
	paddingLeft: 10,
	fontVariantNumeric: "tabular-nums",
};

// Green when comfortably instant, amber when borderline, red when sluggish.
// Thresholds per metric: note-open sub-frame (<50ms), serialize tiny (<8ms),
// interaction/INP follows the Web Vitals good/needs-improvement cut (200/500).
function tint(metric: string, value: number): string {
	let good = 50;
	let bad = 150;
	if (metric.startsWith("serialize")) [good, bad] = [8, 20];
	else if (metric.startsWith("interaction")) [good, bad] = [200, 500];
	else if (metric.startsWith("long-task")) [good, bad] = [50, 100];
	if (value <= good) return "#4ade80";
	if (value <= bad) return "#fbbf24";
	return "#f87171";
}

function hitColor(rate: number | null): string {
	if (rate === null) return "#9ca3af";
	if (rate >= 90) return "#4ade80";
	if (rate >= 60) return "#fbbf24";
	return "#f87171";
}

function verdictColor(verdict: TPerfHeadline["verdict"]): string {
	if (verdict === "instant") return "#4ade80";
	if (verdict === "good") return "#fbbf24";
	if (verdict === "janky") return "#f87171";
	return "#9ca3af";
}
