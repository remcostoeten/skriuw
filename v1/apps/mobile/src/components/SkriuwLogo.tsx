import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

type Props = {
	size?: number;
	color?: string;
};

/** Compact Skriuw mark, matching the sidebar variant used by the web app. */
export function SkriuwLogo({ size = 32, color = "#f5f5f5" }: Props) {
	return (
		<Svg width={size} height={size} viewBox="0 0 40 40">
			<Defs>
				<LinearGradient id="skriuwLogo" x1="0" y1="0" x2="1" y2="1">
					<Stop offset="0" stopColor={color} stopOpacity={1} />
					<Stop offset="0.5" stopColor={color} stopOpacity={0.8} />
					<Stop offset="1" stopColor={color} stopOpacity={1} />
				</LinearGradient>
			</Defs>
			<Rect x="4" y="8" width="8" height="24" rx="1" fill="url(#skriuwLogo)" />
			<Rect x="16" y="4" width="8" height="32" rx="1" fill="url(#skriuwLogo)" />
			<Rect x="28" y="12" width="8" height="16" rx="1" fill="url(#skriuwLogo)" />
		</Svg>
	);
}
