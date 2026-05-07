import { NextResponse, type NextRequest } from "next/server";
import {
  createSupabaseAdminClient,
  getAuthenticatedUser,
} from "@/core/supabase/server-client";

const DELETE_CONFIRM_PREFIX = "DELETE ";
const USER_SCOPED_TABLES = [
  "user_recents",
  "journal_entries",
  "tags",
  "notes",
  "folders",
] as const;

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser().catch(() => ({ user: null }));

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { confirmation?: string } | null;
  const email = user.email?.trim();
  const expectedConfirmation = `${DELETE_CONFIRM_PREFIX}${email ?? user.id}`;

  if (body?.confirmation !== expectedConfirmation) {
    return NextResponse.json({ error: "Confirmation did not match." }, { status: 400 });
  }

  const admin = (() => {
    try {
      return createSupabaseAdminClient();
    } catch {
      return null;
    }
  })();

  if (!admin) {
    return NextResponse.json(
      { error: "Account deletion is not configured." },
      { status: 500 },
    );
  }

  for (const table of USER_SCOPED_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
