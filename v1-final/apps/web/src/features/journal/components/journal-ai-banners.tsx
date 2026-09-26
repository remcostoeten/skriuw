/* eslint-disable react-doctor/no-multi-comp */
"use client";

import { AlertTriangle, Sparkles, Undo2, X } from "lucide-react";
import type { listFallbackAiKeys } from "@/features/ai/lib/resolve-ai-key";
import type { JournalAiUiError, JournalRateLimitPrompt } from "../hooks/use-journal-ai";

type AiErrorBannerProps = {
	error: JournalAiUiError;
	onDismiss: () => void;
};

export function JournalAiErrorBanner({ error, onDismiss }: AiErrorBannerProps) {
	return (
		<div className="border-b border-destructive/25 bg-[linear-gradient(135deg,hsl(var(--destructive)/0.12),hsl(var(--background)/0.94))] px-4 py-3 text-xs">
			<div className="flex items-start gap-3">
				<AlertTriangle
					className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
					strokeWidth={1.5}
				/>
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-destructive">{error.title}</span>
						<span className="border border-destructive/25 bg-destructive/10 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-destructive/80">
							{error.action}
						</span>
						{error.code && (
							<span className="font-mono text-[10px] text-destructive/55">
								{error.code}
							</span>
						)}
					</div>
					<p className="text-destructive/90">{error.message}</p>
					{error.details && <p className="text-destructive/65">{error.details}</p>}
					{error.eventId && (
						<p className="font-mono text-[10px] text-destructive/45">
							Diagnostic event: {error.eventId}
						</p>
					)}
				</div>
				<button
					type="button"
					onClick={onDismiss}
					className="shrink-0 text-destructive/50 transition-colors hover:text-destructive"
					aria-label="Dismiss AI error"
				>
					<X className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
			</div>
		</div>
	);
}

type SpellCheckRevertBannerProps = {
	onRevert: () => void;
	onKeep: () => void;
};

export function JournalSpellCheckRevertBanner({ onRevert, onKeep }: SpellCheckRevertBannerProps) {
	return (
		<div className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
			<div className="flex items-center gap-3">
				<Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
				<span className="min-w-0 flex-1 text-muted-foreground">
					AI spell check replaced the entry content.
				</span>
				<button
					type="button"
					onClick={onRevert}
					className="flex shrink-0 items-center gap-1.5 border border-border bg-background px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
				>
					<Undo2 className="h-3 w-3" strokeWidth={1.6} />
					Revert
				</button>
				<button
					type="button"
					onClick={onKeep}
					className="shrink-0 border border-transparent px-2 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
				>
					Keep
				</button>
			</div>
		</div>
	);
}

type AiRateLimitBannerProps = {
	prompt: JournalRateLimitPrompt;
	availableKeysForFallback: ReturnType<typeof listFallbackAiKeys>;
	onRetryWithKey: (keyId: string) => void;
	onDismiss: () => void;
};

export function JournalAiRateLimitBanner({
	prompt,
	availableKeysForFallback,
	onRetryWithKey,
	onDismiss,
}: AiRateLimitBannerProps) {
	return (
		<div className="border-b border-warning/25 bg-[linear-gradient(135deg,hsl(var(--warning)/0.14),hsl(var(--background)/0.94))] px-4 py-3 text-xs">
			<div className="flex items-start gap-3">
				<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={1.5} />
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					<div className="space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-medium text-warning-foreground">
								AI key rate limited
							</span>
							<span className="border border-warning/30 bg-warning/10 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-warning-foreground/80">
								{prompt.action}
							</span>
						</div>
						<p className="text-warning-foreground/80">{prompt.message}</p>
						{prompt.details && (
							<p className="text-warning-foreground/55">{prompt.details}</p>
						)}
						{prompt.eventId && (
							<p className="font-mono text-[10px] text-warning-foreground/40">
								Diagnostic event: {prompt.eventId}
							</p>
						)}
					</div>
					{availableKeysForFallback.length > 0 ? (
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="text-warning-foreground/55">
								Retry with another saved key:
							</span>
							{availableKeysForFallback.map((k) => (
								<button
									key={k.id}
									type="button"
									onClick={() => onRetryWithKey(k.id)}
									className="border border-warning/40 bg-warning/10 px-2 py-0.5 text-warning-foreground transition-colors hover:bg-warning/20"
								>
									{k.label}
								</button>
							))}
						</div>
					) : (
						<span className="text-warning-foreground/55">
							{prompt.exhaustedKeyIds.length > 0
								? "All saved keys have been rate limited."
								: "The server AI key is rate limited or out of quota."}
						</span>
					)}
				</div>
				<button
					type="button"
					onClick={onDismiss}
					className="mt-0.5 shrink-0 text-warning/50 transition-colors hover:text-warning"
					aria-label="Dismiss rate limit warning"
				>
					<X className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
			</div>
		</div>
	);
}
