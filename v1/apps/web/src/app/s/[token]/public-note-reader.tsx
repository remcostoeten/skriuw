"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Editor } from "@/features/editor/components/editor";
import { markdownToRichDocument } from "@/domain/notes/rich-document";
import { stripMarkdownExtension } from "@/domain/notes/note-links";
import type { TPublicShareSnapshot } from "@/domain/sharing/models";
import type { NoteFile } from "@/types/notes";
import { AvatarFace } from "@/shared/icons/avatar-face";
import { AuthDrawer, AuthProvider } from "@remcostoeten/auth-drawer";
import type { AuthConfig } from "@remcostoeten/auth-drawer";
import { authDrawerAdapter } from "@/features/auth/auth-drawer-adapter";
import { CollabRequestButton } from "@/features/collaboration/components/collab-request-button";
import { useAuth } from "@/core/auth/use-auth";

const authConfig = {
	ui: {
		presentation: { variant: "drawer" },
		visual: {
			backdrop: {
				opacity: 0.94,
				blur: 3,
				gradient: {
					angle: 180,
					from: "hsl(var(--scrim) / 0.12)",
					to: "hsl(var(--scrim) / 0.3)",
					fromPos: 0,
					toPos: 100,
				},
			},
		},
	},
} satisfies AuthConfig;

/** Renders a frozen share snapshot in the app's read-only editor. */
export function PublicNoteReader({
	snapshot,
	initialCollabStatus = "none",
}: {
	snapshot: TPublicShareSnapshot;
	initialCollabStatus?: "none" | "pending" | "collaborator";
}) {
	const auth = useAuth();
	const [authOpen, setAuthOpen] = useState(false);
	const showSignInCta = auth.isReady && auth.phase !== "authenticated";
	const showAppCta = auth.phase === "authenticated";
	const appHref =
		initialCollabStatus === "collaborator"
			? `/app?note=${encodeURIComponent(snapshot.noteId)}`
			: "/app";
	const appCtaLabel = initialCollabStatus === "collaborator" ? "Open in editor" : "Open Skriuw";

	const file = useMemo<NoteFile>(() => {
		const sharedAt = new Date(snapshot.sharedAt);
		return {
			id: "public-share",
			name: snapshot.name,
			content: snapshot.content,
			richContent: snapshot.richContent ?? markdownToRichDocument(snapshot.content),
			preferredEditorMode: snapshot.preferredEditorMode,
			createdAt: sharedAt,
			modifiedAt: sharedAt,
			parentId: null,
			tags: [],
		};
	}, [snapshot]);

	const title = stripMarkdownExtension(snapshot.name).replace(/-/g, " ") || "Untitled";

	return (
		<AuthProvider adapter={authDrawerAdapter}>
			<main className="flex min-h-dvh flex-col bg-background text-foreground">
				<header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
					<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/85">
						{title}
					</span>

					<div className="flex shrink-0 items-center gap-3">
						{snapshot.author && (
							<div className="flex items-center gap-1.5">
								<AvatarFace name={snapshot.author} size={24} />
								<span className="hidden text-[11px] text-muted-foreground/80 sm:inline">
									{snapshot.author}
								</span>
							</div>
						)}

						{snapshot.author && (
							<span
								className="hidden text-[11px] text-muted-foreground/50 sm:inline"
								aria-hidden
							>
								·
							</span>
						)}

						<span className="text-[11px] text-muted-foreground/70">
							{formatDistanceToNow(new Date(snapshot.sharedAt), { addSuffix: true })}
						</span>

						<CollabRequestButton
							noteId={snapshot.noteId}
							onAuthRequired={() => setAuthOpen(true)}
							initialStatus={initialCollabStatus}
						/>

						{showSignInCta && (
							<button
								type="button"
								onClick={() => setAuthOpen(true)}
								className="inline-flex h-7 items-center rounded-md bg-foreground px-3 text-[11px] font-medium text-background transition-opacity hover:opacity-85 active:scale-[0.97]"
							>
								Try Skriuw
							</button>
						)}

						{showAppCta && (
							<Link
								href={appHref}
								className="inline-flex h-7 items-center rounded-md bg-foreground px-3 text-[11px] font-medium text-background transition-opacity hover:opacity-85 active:scale-[0.97]"
							>
								{appCtaLabel}
							</Link>
						)}
					</div>
				</header>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
					<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-2 py-4 sm:px-6">
						<Editor
							file={file}
							files={[]}
							editorMode={snapshot.preferredEditorMode}
							editorFontId="inter"
							editorLineHeight="comfortable"
							readOnly
							onContentChange={() => {}}
						/>
					</div>
				</div>

				<footer className="border-t border-border px-6 py-3 text-center text-[11px] text-muted-foreground/70">
					Shared with{" "}
					<Link
						href="/"
						className="font-medium text-foreground/80 transition-colors hover:text-foreground"
					>
						Skriuw
					</Link>
				</footer>
			</main>

			<AuthDrawer
				adapter={authDrawerAdapter}
				hideTrigger
				open={authOpen}
				onOpenChange={setAuthOpen}
				config={authConfig}
			/>
		</AuthProvider>
	);
}
