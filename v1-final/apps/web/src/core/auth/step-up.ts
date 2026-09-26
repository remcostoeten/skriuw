"use client";

export type StepUpCode = "password_required" | "invalid_password" | "reauth_required";

export class StepUpRequiredError extends Error {
	readonly code: StepUpCode;

	constructor(code: StepUpCode, message: string) {
		super(message);
		this.name = "StepUpRequiredError";
		this.code = code;
	}
}

/** Reads a step-up failure code from an API error payload, if present. */
export function stepUpCodeFromPayload(payload: { code?: string } | null): StepUpCode | null {
	if (payload?.code === "password_required") return "password_required";
	if (payload?.code === "invalid_password") return "invalid_password";
	if (payload?.code === "reauth_required") return "reauth_required";
	return null;
}

/** Narrows an unknown error to a {@link StepUpRequiredError}. */
export function isStepUpError(error: unknown): error is StepUpRequiredError {
	return error instanceof StepUpRequiredError;
}
