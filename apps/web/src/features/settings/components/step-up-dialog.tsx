"use client";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import { getProviderLabel } from "@/core/auth/connections";
import type { OAuthProvider } from "@/core/auth";

type Props = {
	open: boolean;
	mode: "password" | "reauth";
	title: string;
	description: string;
	confirmLabel: string;
	password: string;
	error: string | null;
	pending: boolean;
	reauthProviders: OAuthProvider[];
	onPasswordChange: (value: string) => void;
	onConfirm: () => void;
	onReauth: (provider: OAuthProvider) => void;
	onOpenChange: (open: boolean) => void;
};

export function StepUpDialog(props: Props) {
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{props.title}</DialogTitle>
					<DialogDescription>{props.description}</DialogDescription>
				</DialogHeader>

				{props.mode === "password" ? (
					<form
						className="flex flex-col gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							props.onConfirm();
						}}
					>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="step-up-password">Current password</Label>
							<Input
								id="step-up-password"
								type="password"
								autoComplete="current-password"
								autoFocus
								value={props.password}
								onChange={(event) => props.onPasswordChange(event.target.value)}
								disabled={props.pending}
							/>
						</div>
						{props.error && (
							<p role="alert" className="text-xs text-destructive">
								{props.error}
							</p>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => props.onOpenChange(false)}
								disabled={props.pending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={props.pending || !props.password.trim()}>
								{props.pending ? "Verifying…" : props.confirmLabel}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<div className="flex flex-col gap-3">
						{props.error && (
							<p role="alert" className="text-xs text-destructive">
								{props.error}
							</p>
						)}
						<div className="flex flex-col gap-2">
							{props.reauthProviders.map((provider) => (
								<Button
									key={provider}
									onClick={() => props.onReauth(provider)}
									disabled={props.pending}
								>
									Re-authenticate with {getProviderLabel(provider)}
								</Button>
							))}
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => props.onOpenChange(false)}
								disabled={props.pending}
							>
								Cancel
							</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
