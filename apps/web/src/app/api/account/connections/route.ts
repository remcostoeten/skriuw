import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/core/db";
import { auth } from "@/lib/auth";

const CREDENTIAL_PROVIDER_ID = "credential";

type LinkedAccount = {
	accountId: string;
	providerId: string;
	createdAt: string | null;
};

type ConnectionsResponse = {
	credential: boolean;
	accounts: LinkedAccount[];
	loginMethodCount: number;
};

type UnlinkBody = {
	providerId?: string;
	accountId?: string;
};

async function loadAccounts(requestHeaders: Headers): Promise<LinkedAccount[]> {
	const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
	return accounts.map((account) => ({
		accountId: account.accountId,
		providerId: account.providerId,
		createdAt:
			account.createdAt instanceof Date
				? account.createdAt.toISOString()
				: (account.createdAt ?? null),
	}));
}

export async function GET() {
	try {
		await getAuthenticatedUser();
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const requestHeaders = await headers();
	try {
		const accounts = await loadAccounts(requestHeaders);
		const credential = accounts.some(
			(account) => account.providerId === CREDENTIAL_PROVIDER_ID,
		);
		const payload: ConnectionsResponse = {
			credential,
			accounts: accounts.filter(
				(account) => account.providerId !== CREDENTIAL_PROVIDER_ID,
			),
			loginMethodCount: accounts.length,
		};
		return NextResponse.json(payload);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Could not load connected accounts.",
			},
			{ status: 500 },
		);
	}
}

export async function DELETE(request: NextRequest) {
	try {
		await getAuthenticatedUser();
	} catch {
		return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
	}

	const body = (await request.json().catch(() => null)) as UnlinkBody | null;
	const providerId = body?.providerId?.trim();
	if (!providerId) {
		return NextResponse.json({ error: "Missing provider." }, { status: 400 });
	}

	const requestHeaders = await headers();

	let accounts: LinkedAccount[];
	try {
		accounts = await loadAccounts(requestHeaders);
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Could not load connected accounts.",
			},
			{ status: 500 },
		);
	}

	if (accounts.length <= 1) {
		return NextResponse.json(
			{
				error:
					"This is your only sign-in method. Add a password or another provider before disconnecting it.",
			},
			{ status: 409 },
		);
	}

	try {
		await auth.api.unlinkAccount({
			headers: requestHeaders,
			body: { providerId, accountId: body?.accountId },
		});
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error ? error.message : "Could not disconnect this account.",
			},
			{ status: 500 },
		);
	}

	return NextResponse.json({ ok: true });
}
