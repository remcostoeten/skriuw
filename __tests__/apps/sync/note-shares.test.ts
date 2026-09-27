import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  CredentialVerification,
  CredentialVerifier,
  SyncAccessConfiguration,
} from "../../../apps/sync/src/access";
import {
  MAX_SHARED_MARKDOWN_BYTES,
  handleNoteShareRequest,
  handlePublicShareRequest,
  newShareId,
} from "../../../apps/sync/src/note-shares";

const NOW = 1_800_000_000;
const ORIGIN = "https://skriuw.test";
const OWNER_TOKEN = "owner-token";
const OTHER_TOKEN = "other-token";

class TokenVerifier implements CredentialVerifier {
  async verifyBearerToken(token: string): Promise<CredentialVerification> {
    const subject =
      token === OWNER_TOKEN ? "user-owner" : token === OTHER_TOKEN ? "user-other" : null;
    if (subject === null) return { ok: false, code: "credential_invalid" };
    return {
      ok: true,
      identity: { subject, sessionId: `session-${subject}`, expiresAtEpochSeconds: NOW + 3_600 },
    };
  }
}

const accessConfiguration: SyncAccessConfiguration = {
  state: "ready",
  credentialVerifier: new TokenVerifier(),
  membershipSource: {
    async lookupMembership() {
      return { state: "denied" };
    },
  },
};

let issuedIds: string[] = [];

function ownerRoute(
  path: string,
  init: { method: string; token?: string; body?: object },
): Promise<Response> {
  const headers = new Headers();
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return handleNoteShareRequest(
    new Request(`https://cloud.test${path}`, {
      method: init.method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    }),
    {
      accessConfiguration,
      database: env.AUTH_DB,
      publicOrigin: ORIGIN,
      nowEpochSeconds: () => NOW,
      newShareId() {
        const id = newShareId();
        issuedIds.push(id);
        return id;
      },
    },
  );
}

function publicRead(id: string): Promise<Response> {
  return handlePublicShareRequest(new Request(`https://cloud.test/shares/${id}`), env.AUTH_DB);
}

function note(
  overrides: Partial<{ noteId: string; title: string; markdown: string; live: boolean }> = {},
) {
  return {
    noteId: "note-1",
    title: "Trip plan",
    markdown: "# Trip plan\n\nPack light.",
    live: false,
    ...overrides,
  };
}

beforeAll(async () => {
  await applyD1Migrations(env.AUTH_DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  issuedIds = [];
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare("DELETE FROM note_share"),
    env.AUTH_DB.prepare(`DELETE FROM "user"`),
    ...["user-owner", "user-other"].map((id) =>
      env.AUTH_DB.prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES (?1, ?1, ?1 || '@test', 1, 0, 0)`,
      ).bind(id),
    ),
  ]);
});

describe("public note shares", () => {
  it("publishes a note behind an unguessable link anyone can read", async () => {
    const created = await ownerRoute("/v1/shares", {
      method: "POST",
      token: OWNER_TOKEN,
      body: note(),
    });
    expect(created.status).toBe(201);
    const share = await created.json<{ id: string; url: string; noteId: string; live: boolean }>();
    expect(share.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(share).toMatchObject({ noteId: "note-1", live: false, url: `${ORIGIN}/s/${share.id}/` });

    const read = await publicRead(share.id);
    expect(read.status).toBe(200);
    expect(read.headers.get("X-Robots-Tag")).toBe("noindex");
    const body = await read.json();
    expect(body).toEqual({
      title: "Trip plan",
      markdown: "# Trip plan\n\nPack light.",
      updatedAt: NOW,
    });
    expect(JSON.stringify(body)).not.toContain("user-owner");
  });

  it("republishes the same note behind the same link", async () => {
    const first = await (
      await ownerRoute("/v1/shares", { method: "POST", token: OWNER_TOKEN, body: note() })
    ).json<{ id: string }>();
    const second = await ownerRoute("/v1/shares", {
      method: "POST",
      token: OWNER_TOKEN,
      body: note({ markdown: "Updated", live: true }),
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ id: first.id, live: true });
    expect(await (await publicRead(first.id)).json()).toMatchObject({ markdown: "Updated" });
  });

  it("updates an existing link in place but never recreates a revoked one", async () => {
    const share = await (
      await ownerRoute("/v1/shares", {
        method: "POST",
        token: OWNER_TOKEN,
        body: note({ live: true }),
      })
    ).json<{ id: string }>();
    const updated = await ownerRoute(`/v1/shares/${share.id}`, {
      method: "PUT",
      token: OWNER_TOKEN,
      body: { title: "Trip plan v2", markdown: "Pack lighter." },
    });
    expect(updated.status).toBe(200);
    expect(await (await publicRead(share.id)).json()).toMatchObject({
      title: "Trip plan v2",
      markdown: "Pack lighter.",
    });

    const foreign = await ownerRoute(`/v1/shares/${share.id}`, {
      method: "PUT",
      token: OTHER_TOKEN,
      body: { title: "Hijacked", markdown: "x" },
    });
    expect(foreign.status).toBe(404);

    await ownerRoute(`/v1/shares/${share.id}`, { method: "DELETE", token: OWNER_TOKEN });
    const afterRevoke = await ownerRoute(`/v1/shares/${share.id}`, {
      method: "PUT",
      token: OWNER_TOKEN,
      body: { title: "Late", markdown: "Late edit" },
    });
    expect(afterRevoke.status).toBe(404);
    const count = await env.AUTH_DB.prepare("SELECT COUNT(*) AS total FROM note_share").first<{
      total: number;
    }>();
    expect(count?.total).toBe(0);
  });

  it("lists only the caller's shares and lets only the owner revoke", async () => {
    const mine = await (
      await ownerRoute("/v1/shares", { method: "POST", token: OWNER_TOKEN, body: note() })
    ).json<{ id: string }>();
    await ownerRoute("/v1/shares", { method: "POST", token: OTHER_TOKEN, body: note() });

    const listed = await (
      await ownerRoute("/v1/shares", { method: "GET", token: OWNER_TOKEN })
    ).json<{ shares: { id: string }[] }>();
    expect(listed.shares.map((share) => share.id)).toEqual([mine.id]);

    expect(
      (await ownerRoute(`/v1/shares/${mine.id}`, { method: "DELETE", token: OTHER_TOKEN })).status,
    ).toBe(404);
    expect((await publicRead(mine.id)).status).toBe(200);
    expect(
      (await ownerRoute(`/v1/shares/${mine.id}`, { method: "DELETE", token: OWNER_TOKEN })).status,
    ).toBe(204);
    expect((await publicRead(mine.id)).status).toBe(404);
  });

  it("requires a signed-in account for every owner route", async () => {
    expect((await ownerRoute("/v1/shares", { method: "POST", body: note() })).status).toBe(401);
    expect((await ownerRoute("/v1/shares", { method: "GET", token: "stranger" })).status).toBe(401);
  });

  it("refuses unknown fields, malformed note ids, and oversized notes", async () => {
    const extra = await ownerRoute("/v1/shares", {
      method: "POST",
      token: OWNER_TOKEN,
      body: { ...note(), ownerUserId: "user-other" },
    });
    expect(extra.status).toBe(400);
    const badId = await ownerRoute("/v1/shares", {
      method: "POST",
      token: OWNER_TOKEN,
      body: note({ noteId: "../etc" }),
    });
    expect(badId.status).toBe(400);
    const huge = await ownerRoute("/v1/shares", {
      method: "POST",
      token: OWNER_TOKEN,
      body: note({ markdown: "a".repeat(MAX_SHARED_MARKDOWN_BYTES + 1) }),
    });
    expect(huge.status).toBe(413);
    expect(issuedIds).toEqual([]);
  });

  it("answers malformed share ids without touching storage", async () => {
    expect((await publicRead("short")).status).toBe(404);
    expect((await publicRead("x".repeat(22))).status).toBe(404);
  });
});
