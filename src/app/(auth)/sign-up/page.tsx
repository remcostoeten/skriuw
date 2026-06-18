import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Create account",
	description: "Create a Skriuw account to sync your notes, journal, and writing workspace.",
	alternates: {
		canonical: "/app",
	},
	robots: {
		index: true,
		follow: true,
	},
};

export default function SignUpPage() {
	redirect("/app?auth=sign-up");
}
