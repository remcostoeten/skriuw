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
import {
  MAX_SHARED_IMAGES,
  MAX_SHARED_IMAGE_BYTES,
} from "../../../apps/sync/src/note-share-images";

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
      images: env.SYNC_CONTENT,
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
  return handlePublicShareRequest(
    new Request(`https://cloud.test/shares/${id}`),
    env.AUTH_DB,
    env.SYNC_CONTENT,
  );
}

function publicImage(id: string, imageId: string): Promise<Response> {
  return handlePublicShareRequest(
    new Request(`https://cloud.test/shares/${id}/images/${imageId}`),
    env.AUTH_DB,
    env.SYNC_CONTENT,
  );
}

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 4, 5, 6];

function base64(bytes: readonly number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function upload(id: string, bytes: readonly number[] = PNG_BYTES, mimeType = "image/png") {
  return { id, mimeType, data: base64(bytes) };
}

async function storedImageKeys(): Promise<string[]> {
  const listed = await env.SYNC_CONTENT.list({ prefix: "note-shares/" });
  return listed.objects.map((object) => object.key).sort();
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
  const keys = await storedImageKeys();
  if (keys.length > 0) await env.SYNC_CONTENT.delete(keys);
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
      images: [],
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

  it("publishes images and serves them with a safe content type and long cache", async () => {
    const created = await ownerRoute("/v1/shares", {
      method: "POST",
      token: OWNER_TOKEN,
      body: {
        ...note({ markdown: "![Beach](images/img-1)" }),
        images: [upload("img-1"), upload("img-2", JPEG_BYTES, "image/jpeg")],
      },
    });
    expect(created.status).toBe(201);
    const share = await created.json<{ id: string; imageIds: string[] }>();
    expect(share.imageIds).toEqual(["img-1", "img-2"]);

    const read = await (await publicRead(share.id)).json<{ images: string[] }>();
    expect(read.images.sort()).toEqual(["img-1", "img-2"]);

    const image = await publicImage(share.id, "img-1");
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/png");
    expect(image.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(image.headers.get("Cache-Control")).toContain("max-age=31536000");
    expect([...new Uint8Array(await image.arrayBuffer())]).toEqual(PNG_BYTES);
    expect((await publicImage(share.id, "img-3")).status).toBe(404);
    expect((await publicImage(share.id, "..%2Fx")).status).toBe(404);
  });

  it("keeps images referenced by id, drops omitted ones, and refuses unknown references", async () => {
    const share = await (
      await ownerRoute("/v1/shares", {
        method: "POST",
        token: OWNER_TOKEN,
        body: { ...note({ live: true }), images: [upload("img-1"), upload("img-2")] },
      })
    ).json<{ id: string }>();

    const kept = await ownerRoute(`/v1/shares/${share.id}`, {
      method: "PUT",
      token: OWNER_TOKEN,
      body: { title: "Trip", markdown: "![a](images/img-1)", images: [{ id: "img-1" }] },
    });
    expect(kept.status).toBe(200);
    expect(await kept.json()).toMatchObject({ imageIds: ["img-1"] });
    expect(await storedImageKeys()).toEqual([`note-shares/${share.id}/images/img-1`]);

    const missing = await ownerRoute(`/v1/shares/${share.id}`, {
      method: "PUT",
      token: OWNER_TOKEN,
      body: { title: "Trip", markdown: "x", images: [{ id: "img-2" }] },
    });
    expect(missing.status).toBe(409);
    expect(await missing.json()).toEqual({ error: "share_image_missing" });

    const withoutImages = await ownerRoute(`/v1/shares/${share.id}`, {
      method: "PUT",
      token: OWNER_TOKEN,
      body: { title: "Trip", markdown: "no pictures" },
    });
    expect(withoutImages.status).toBe(200);
    expect(await storedImageKeys()).toEqual([]);
  });

  it("deletes a share's images when it is revoked", async () => {
    const share = await (
      await ownerRoute("/v1/shares", {
        method: "POST",
        token: OWNER_TOKEN,
        body: { ...note(), images: [upload("img-1")] },
      })
    ).json<{ id: string }>();
    expect(await storedImageKeys()).toHaveLength(1);

    await ownerRoute(`/v1/shares/${share.id}`, { method: "DELETE", token: OWNER_TOKEN });
    expect(await storedImageKeys()).toEqual([]);
    expect((await publicImage(share.id, "img-1")).status).toBe(404);
  });

  it("refuses unsafe, mislabeled, oversized, and excess images without storing any", async () => {
    async function publishImages(images: object[]) {
      return ownerRoute("/v1/shares", {
        method: "POST",
        token: OWNER_TOKEN,
        body: { ...note(), images },
      });
    }
    const svg = await publishImages([
      upload("img-1", [...new TextEncoder().encode("<svg onload=alert(1)>")], "image/svg+xml"),
    ]);
    expect(svg.status).toBe(400);
    const mislabeled = await publishImages([upload("img-1", JPEG_BYTES, "image/png")]);
    expect(mislabeled.status).toBe(400);
    expect(await mislabeled.json()).toEqual({ error: "invalid_image" });
    expect((await publishImages([upload("../escape")])).status).toBe(400);
    expect((await publishImages([upload("img-1"), upload("img-1")])).status).toBe(400);
    expect(
      (await publishImages([{ id: "img-1", mimeType: "image/png", data: "%%%%" }])).status,
    ).toBe(400);
    expect((await publishImages([{ ...upload("img-1"), extra: true }])).status).toBe(400);
    const excess = await publishImages(
      Array.from({ length: MAX_SHARED_IMAGES + 1 }, (_, index) => upload(`img-${index}`)),
    );
    expect(excess.status).toBe(413);
    const oversized = new Uint8Array(MAX_SHARED_IMAGE_BYTES + 1);
    oversized.set(PNG_BYTES);
    const huge = await publishImages([
      { id: "img-1", mimeType: "image/png", data: bytesToBase64(oversized) },
    ]);
    expect(huge.status).toBe(413);
    expect(await storedImageKeys()).toEqual([]);
    expect(issuedIds).toEqual([]);
  });

  it("answers malformed share ids without touching storage", async () => {
    expect((await publicRead("short")).status).toBe(404);
    expect((await publicRead("x".repeat(22))).status).toBe(404);
  });
});

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8_192));
  }
  return btoa(binary);
}
