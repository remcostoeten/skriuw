import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { CloudOff, RotateCcw, type LucideIcon } from "lucide-react-native";
import { useTheme } from "@/theme/theme-provider";
import { useReducedMotion } from "@/shared/use-reduced-motion";

type LoadingVariant = "list" | "document" | "journal";

export function ContentLoading({
	variant = "list",
	label = "Gathering your writing",
}: {
	variant?: LoadingVariant;
	label?: string;
}) {
	const { theme } = useTheme();
	const reducedMotion = useReducedMotion();
	const pulse = useRef(new Animated.Value(0.42)).current;

	useEffect(() => {
		if (reducedMotion) {
			pulse.setValue(0.65);
			return;
		}
		const animation = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, { toValue: 0.82, duration: 650, useNativeDriver: true }),
				Animated.timing(pulse, { toValue: 0.42, duration: 650, useNativeDriver: true }),
			]),
		);
		animation.start();
		return () => animation.stop();
	}, [pulse, reducedMotion]);

	const widths = variant === "document" ? ["62%", "94%", "88%", "72%"] : ["44%", "76%", "58%"];

	return (
		<View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.loadingRoot}>
			<View style={styles.loadingHeading}>
				<View>
					<Text style={[styles.loadingEyebrow, { color: theme.textDim }]}>SKRIUW</Text>
					<Text style={[styles.loadingLabel, { color: theme.mutedForeground }]}>
						{label}
					</Text>
				</View>
				<Animated.View
					style={[styles.liveDot, { backgroundColor: theme.tag, opacity: pulse }]}
				/>
			</View>
			<Animated.View style={{ opacity: pulse }}>
				{variant === "journal" ? (
					<View style={[styles.dateBlock, { borderLeftColor: theme.border }]}>
						<Skeleton width="28%" height={8} />
						<Skeleton width="72%" height={25} />
						<View style={{ height: 18 }} />
						<Skeleton width="92%" height={11} />
						<Skeleton width="84%" height={11} />
						<Skeleton width="63%" height={11} />
					</View>
				) : (
					widths.map((width, index) => (
						<View
							key={`${width}-${index}`}
							style={[styles.skeletonRow, { borderBottomColor: theme.divider }]}
						>
							<Skeleton
								width={variant === "document" ? width : "100%"}
								height={variant === "document" ? 11 : 48}
							/>
						</View>
					))
				)}
			</Animated.View>
		</View>
	);
}

function Skeleton({ width, height }: { width: string; height: number }) {
	const { theme } = useTheme();
	return (
		<View
			style={{
				width: width as never,
				height,
				borderRadius: 5,
				backgroundColor: theme.bgActive,
			}}
		/>
	);
}

export function ErrorState({
	title,
	description,
	onRetry,
	retryLabel = "Try again",
	icon: Icon = CloudOff,
}: {
	title: string;
	description: string;
	onRetry?: () => void;
	retryLabel?: string;
	icon?: LucideIcon;
}) {
	const { theme } = useTheme();
	return (
		<View accessibilityRole="alert" style={styles.errorRoot}>
			<View
				style={[
					styles.errorIcon,
					{ backgroundColor: theme.card, borderColor: theme.border },
				]}
			>
				<Icon size={22} color={theme.mutedForeground} strokeWidth={1.7} />
			</View>
			<Text style={[styles.errorTitle, { color: theme.foreground }]}>{title}</Text>
			<Text style={[styles.errorCopy, { color: theme.mutedForeground }]}>{description}</Text>
			{onRetry ? (
				<Pressable
					onPress={onRetry}
					style={({ pressed }) => [
						styles.retryButton,
						{ backgroundColor: theme.foreground, opacity: pressed ? 0.78 : 1 },
					]}
				>
					<RotateCcw size={15} color={theme.background} strokeWidth={2.2} />
					<Text style={[styles.retryText, { color: theme.background }]}>
						{retryLabel}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	loadingRoot: { flex: 1, paddingHorizontal: 20, paddingTop: 28 },
	loadingHeading: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 24,
	},
	loadingEyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 2.1, marginBottom: 5 },
	loadingLabel: { fontSize: 13 },
	liveDot: { width: 7, height: 7, borderRadius: 4 },
	dateBlock: { borderLeftWidth: 2, paddingLeft: 18, gap: 12, paddingVertical: 4 },
	skeletonRow: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
	errorRoot: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
	errorIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		borderWidth: StyleSheet.hairlineWidth,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
	},
	errorTitle: { fontSize: 17, fontWeight: "600", textAlign: "center" },
	errorCopy: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6, maxWidth: 290 },
	retryButton: {
		minHeight: 42,
		borderRadius: 21,
		paddingHorizontal: 17,
		marginTop: 18,
		flexDirection: "row",
		alignItems: "center",
		gap: 7,
	},
	retryText: { fontSize: 13, fontWeight: "700" },
});
