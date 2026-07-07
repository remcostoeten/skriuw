import type { Metadata } from "next";
import { headers } from "next/headers";
import { peekShare } from "@/domain/sharing/public";
import { getCollaborationStatusForNote } from "@/domain/collaboration/actions";
import { ShareStateScreen } from "./share-state-screen";
import { ShareViewer } from "./share-viewer";

const PRIVATE_ROBOTS: Metadata["robots"] = { index: false, follow: false };

async function resolveSharePageUrl(token: string): Promise<string> {
	const headersList = await headers();
	const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
	const proto = headersList.get("x-forwarded-proto") ?? "https";
	if (!host) return `/s/${token}`;
	return `${proto}://${host}/s/${token}`;
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ token: string }>;
}): Promise<Metadata> {
	const { token } = await params;
	const [peek, pageUrl] = await Promise.all([peekShare(token), resolveSharePageUrl(token)]);

	if (peek.status !== "ready") {
		return {
			title: "Shared note · Skriuw",
			robots: PRIVATE_ROBOTS,
		};
	}

	const title = `${peek.name} · Skriuw`;
	const description = peek.description;

	return {
		title,
		description,
		robots: PRIVATE_ROBOTS,
		openGraph: {
			title,
			description,
			url: pageUrl,
			type: "article",
			siteName: "Skriuw",
		},
		twitter: {
			card: "summary",
			title,
			description,
		},
	};
}

// Snapshots can change (re-publish, expiry, consumption) — never statically cache.
export const dynamic = "force-dynamic";

export default async function PublicSharePage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const peek = await peekShare(token);

	if (peek.status !== "ready") {
		return <ShareStateScreen status={peek.status} />;
	}

	const initialCollabStatus = await getCollaborationStatusForNote(peek.noteId);

	return (
		<ShareViewer
			token={token}
			requiresPassword={peek.requiresPassword}
			viewOnce={peek.viewOnce}
			initialCollabStatus={initialCollabStatus}
		/>
	);
}
