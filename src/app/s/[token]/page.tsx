import type { Metadata } from "next";
import { peekShare } from "@/domain/sharing/public";
import { ShareStateScreen } from "./share-state-screen";
import { ShareViewer } from "./share-viewer";

// Public shared notes must never be indexed.
export const metadata: Metadata = {
	title: "Shared note · Skriuw",
	robots: { index: false, follow: false },
};

// Snapshots can change (re-publish, expiry, consumption) — never statically cache.
export const dynamic = "force-dynamic";

export default async function PublicSharePage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	const peek = await peekShare(token);

	if (peek.status !== "ready") {
		return <ShareStateScreen status={peek.status} />;
	}

	return (
		<ShareViewer
			token={token}
			name={peek.name}
			requiresPassword={peek.requiresPassword}
			viewOnce={peek.viewOnce}
		/>
	);
}
