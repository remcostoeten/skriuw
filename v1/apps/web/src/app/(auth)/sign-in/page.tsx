import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Sign in",
	description: "Sign in to Skriuw to sync your notes, journal, and writing workspace.",
	alternates: {
		canonical: "/app",
	},
	robots: {
		index: true,
		follow: true,
	},
};

export const instant = false;

export default function SignInPage() {
	redirect("/app?auth=sign-in");
}
