"use client";

import { useEffect, useState } from "react";
import { clearSamples, getSummaryRows, isPerfEnabled, type TPerfSummary } from "./track";

/**
 * Dev-only on-screen panel that shows live interaction-perf numbers (warm/cold
 * note-open latency + serialize cost) without needing the console. Polls the
 * tracker twice a second. Renders nothing unless tracking is enabled, so it is
 * free in production. Collapsible; starts collapsed to a small pill.
 */
export function PerfOverlay() {
	const [rows, setRows] = useState<Record<string, TPerfSummary>>({});
	const [open, setOpen] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		if (!isPerfEnabled()) return;
		const id = window.setInterval(() => setRows(getSummaryRows()), 500);
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
// Note-open should be sub-frame (<50ms); serialize should stay tiny (<8ms).
function tint(metric: string, value: number): string {
	const [good, bad] = metric.startsWith("serialize") ? [8, 20] : [50, 150];
	if (value <= good) return "#4ade80";
	if (value <= bad) return "#fbbf24";
	return "#f87171";
}
