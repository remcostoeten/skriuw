export type RelativeDistanceParts =
	| { kind: "numeric"; prefix: string; value: number; unit: string }
	| { kind: "text"; label: string };

const NUMERIC_DISTANCE_PATTERN =
	/^(?:(about|over|almost) )?(\d+) (.+)$/;

export function parseRelativeDistanceLabel(
	label: string,
): RelativeDistanceParts {
	const match = label.match(NUMERIC_DISTANCE_PATTERN);
	if (!match) {
		return { kind: "text", label };
	}

	return {
		kind: "numeric",
		prefix: match[1] ? `${match[1]} ` : "",
		value: Number(match[2]),
		unit: match[3],
	};
}
