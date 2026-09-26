export function colorWithAlpha(color: string, alpha: number) {
	const clamped = Math.min(1, Math.max(0, alpha));
	const tokenMatch = color.match(/^hsl\(var\((--[^)]+)\)\)$/);

	if (tokenMatch) {
		return `hsl(var(${tokenMatch[1]}) / ${clamped})`;
	}

	if (/^#[0-9a-fA-F]{6}$/.test(color)) {
		const alphaHex = Math.round(clamped * 255)
			.toString(16)
			.padStart(2, "0");
		return `${color}${alphaHex}`;
	}

	return color;
}
