import { ImageResponse } from "next/og";

export const alt = "Skriuw";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "Skriuw";
const DESCRIPTION =
	"A calm, keyboard-first notes and journal app with account-backed sync across web and mobile.";

function BrandMark() {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: 92,
				height: 92,
				borderRadius: 22,
				background: "#0f0f0f",
				border: "1px solid #2f302d",
				boxShadow: "0 22px 70px rgba(0, 0, 0, 0.36)",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					gap: 9,
					height: 54,
				}}
			>
				<span
					style={{
						width: 10,
						height: 36,
						borderRadius: 3,
						background: "#e7e4d8",
					}}
				/>
				<span
					style={{
						width: 10,
						height: 54,
						borderRadius: 3,
						background: "#74d7c3",
					}}
				/>
				<span
					style={{
						width: 10,
						height: 28,
						borderRadius: 3,
						background: "#f3b44e",
					}}
				/>
			</div>
		</div>
	);
}

export default function Image() {
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
				<div style={{ display: "flex", alignItems: "center", gap: 20 }}>
					<BrandMark />
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 12,
							fontSize: 20,
							fontWeight: 700,
							color: "#b8b3a6",
						}}
					>
						<span
							style={{
								width: 8,
								height: 8,
								borderRadius: 999,
								background: "#74d7c3",
							}}
						/>
						notes / journal / sync
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
					skriuw.app
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 28,
					maxWidth: 900,
				}}
			>
				<div
					style={{
						fontSize: 104,
						fontWeight: 800,
						lineHeight: 0.94,
						letterSpacing: 0,
						color: "#f4f1e8",
					}}
				>
					{TITLE}
				</div>
				<div
					style={{
						fontSize: 34,
						lineHeight: 1.3,
						color: "#c8c2b4",
						maxWidth: 820,
					}}
				>
					{DESCRIPTION}
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
				{["Keyboard-first", "Private notes", "Account-backed sync"].map((label, index) => (
					<div
						key={label}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 12,
							color: "#ddd8cb",
							fontSize: 22,
							fontWeight: 700,
						}}
					>
						<span
							style={{
								width: 12,
								height: 12,
								borderRadius: 999,
								background:
									index === 0 ? "#74d7c3" : index === 1 ? "#6aa8ff" : "#f3b44e",
							}}
						/>
						{label}
					</div>
				))}
			</div>
		</div>,
		{ ...size },
	);
}
