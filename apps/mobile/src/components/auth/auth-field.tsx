import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { authMetrics, authSurface as ui } from "@/theme/colors";

type Props = {
	label: string;
	invalid?: boolean;
} & React.ComponentProps<typeof TextInput>;

export function AuthField({ label, invalid, secureTextEntry, style, ...props }: Props) {
	const [focused, setFocused] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const isSecure = Boolean(secureTextEntry);

	return (
		<View style={{ position: "relative", justifyContent: "center" }}>
			<TextInput
				{...props}
				accessibilityLabel={label}
				placeholder={label}
				placeholderTextColor={ui.textSubtle}
				secureTextEntry={isSecure && !revealed}
				onFocus={(e) => {
					setFocused(true);
					props.onFocus?.(e);
				}}
				onBlur={(e) => {
					setFocused(false);
					props.onBlur?.(e);
				}}
				style={[
					{
						height: authMetrics.controlHeight,
						width: "100%",
						borderRadius: authMetrics.inputRadius,
						backgroundColor: ui.inputBg,
						borderWidth: 1,
						borderColor: invalid
							? ui.errorBorder
							: focused
								? ui.inputBorderFocus
								: ui.inputBorder,
						paddingLeft: 16,
						paddingRight: isSecure ? 48 : 16,
						color: ui.text,
						fontSize: 14,
						letterSpacing: 0.14,
					},
					style,
				]}
			/>

			{isSecure ? (
				<Pressable
					onPress={() => setRevealed((v) => !v)}
					hitSlop={10}
					accessibilityRole="button"
					accessibilityLabel={revealed ? "Hide password" : "Show password"}
					accessibilityState={{ selected: revealed }}
					style={{ position: "absolute", right: 16 }}
				>
					{revealed ? (
						<EyeOff size={16} color={ui.textMuted} />
					) : (
						<Eye size={16} color={ui.textMuted} />
					)}
				</Pressable>
			) : null}
		</View>
	);
}
