import { ImageResponse } from "next/og";
import { peekShare } from "@/domain/sharing/public";

export const alt = "Shared note preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function truncate(text: string, max = 180): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 3)}...`;
}

function normalizeTitle(text: string): string {
	return truncate(text.replace(/\s+/g, " ").trim(), 82);
}

function BrandMark() {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: 86,
				height: 86,
				borderRadius: 21,
				background: "#0f0f0f",
				border: "1px solid #343631",
				boxShadow: "0 22px 70px rgba(0, 0, 0, 0.36)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 8,
					height: 50,
				}}
			>
				<span
					style={{
						width: 9,
						height: 34,
						borderRadius: 3,
						background: "#e7e4d8",
					}}
				/>
				<span
					style={{
						width: 9,
						height: 50,
						borderRadius: 3,
						background: "#74d7c3",
					}}
				/>
				<span
					style={{
						width: 9,
						height: 27,
						borderRadius: 3,
						background: "#f3b44e",
					}}
				/>
			</div>
		</div>
	);
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const peek = await peekShare(token);
	const tokenLabel = truncate(token, 26);

	if (peek.status !== "ready") {
		return new ImageResponse(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					background: "linear-gradient(135deg, #080808 0%, #11120f 48%, #1b1c18 100%)",
					color: "#f1eee6",
					padding: 48,
					fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 18 }}>
						<BrandMark />
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							<div style={{ fontSize: 20, fontWeight: 700, color: "#b8b3a6" }}>
								Skriuw shared note
							</div>
							<div
								style={{
									fontSize: 24,
									fontWeight: 700,
									color: "#f3b44e",
								}}
							>
								Link unavailable
							</div>
						</div>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							padding: "10px 16px",
							borderRadius: 999,
							border: "1px solid #343631",
							background: "rgba(255, 255, 255, 0.04)",
							color: "#a9a498",
							fontSize: 18,
							fontWeight: 700,
						}}
					>
						skriuw.app/s/{tokenLabel}
					</div>
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 24,
						maxWidth: 900,
					}}
				>
					<div
						style={{
							fontSize: 72,
							fontWeight: 800,
							lineHeight: 1,
							color: "#f4f1e8",
						}}
					>
						Shared note unavailable
					</div>
					<div style={{ fontSize: 30, lineHeight: 1.35, color: "#c8c2b4" }}>
						This link may have expired, been revoked, or already been consumed.
					</div>
				</div>

				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						paddingTop: 28,
						borderTop: "1px solid #2a2b27",
						color: "#8f8a80",
						fontSize: 20,
						fontWeight: 700,
					}}
				>
					<span>Private sharing</span>
					<span>Skriuw</span>
				</div>
			</div>,
			{ ...size },
		);
	}

	const title = normalizeTitle(peek.name);
	const description = truncate(peek.description);
	const statusLabel = [
		peek.requiresPassword ? "Password protected" : null,
		peek.viewOnce ? "View once" : null,
	]
		.filter(Boolean)
		.join(" / ");

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				background: "linear-gradient(135deg, #080808 0%, #11120f 48%, #1b1c18 100%)",
				color: "#f1eee6",
				padding: 48,
				fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 24,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 18 }}>
					<BrandMark />
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						<div style={{ fontSize: 20, fontWeight: 700, color: "#b8b3a6" }}>
							Shared note
						</div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								color: "#74d7c3",
								fontSize: 22,
								fontWeight: 700,
							}}
						>
							<span
								style={{
									width: 9,
									height: 9,
									borderRadius: 999,
									background: "#74d7c3",
								}}
							/>
							Public preview
						</div>
					</div>
				</div>

				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: "10px 16px",
						borderRadius: 999,
						border: "1px solid #343631",
						background: "rgba(255, 255, 255, 0.04)",
						color: "#a9a498",
						fontSize: 18,
						fontWeight: 700,
					}}
				>
					skriuw.app/s/{tokenLabel}
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 22,
					maxWidth: 920,
				}}
			>
				<div
					style={{
						fontSize: 76,
						fontWeight: 800,
						lineHeight: 0.98,
						color: "#f4f1e8",
					}}
				>
					{title}
				</div>
				<div
					style={{
						fontSize: 30,
						lineHeight: 1.35,
						color: "#c8c2b4",
						maxWidth: 840,
					}}
				>
					{description}
				</div>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 24,
					paddingTop: 28,
					borderTop: "1px solid #2a2b27",
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					{statusLabel ? (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								padding: "12px 16px",
								borderRadius: 999,
								background: "#24251f",
								border: "1px solid #3a3c34",
								color: "#f4f1e8",
								fontSize: 20,
								fontWeight: 700,
							}}
						>
							{statusLabel}
						</div>
					) : null}
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							padding: "12px 16px",
							borderRadius: 999,
							background: "#17251f",
							border: "1px solid #25483b",
							color: "#a8f0da",
							fontSize: 20,
							fontWeight: 700,
						}}
					>
						Private by default
					</div>
				</div>

				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						color: "#8f8a80",
						fontSize: 20,
						fontWeight: 700,
					}}
				>
					<span>Skriuw share preview</span>
					<span
						style={{
							width: 44,
							height: 4,
							borderRadius: 999,
							background: "#f3b44e",
						}}
					/>
				</div>
			</div>
		</div>,
		{ ...size },
	);
}
