import { describe, expect, it } from "vitest";
import { provisionInternals } from "../src/provision";

describe("sync workspace provisioning", () => {
  it("derives one opaque stable workspace identifier per trusted subject", async () => {
    const first = await provisionInternals.workspaceIdFor("account-1");
    expect(first).toBe(await provisionInternals.workspaceIdFor("account-1"));
    expect(first).not.toBe(await provisionInternals.workspaceIdFor("account-2"));
    expect(first).toMatch(/^w_[a-f0-9]{64}$/);
    expect(first).not.toContain("account-1");
  });

  it("accepts only a bounded device identity and no caller-owned claims", async () => {
    const accepted = await provisionInternals.readProvisionBody(
      new Request("https://cloud.test/v1/sync/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "device_1" }),
      }),
    );
    expect(accepted).toEqual({ ok: true, deviceId: "device_1" });

    const rejected = await provisionInternals.readProvisionBody(
      new Request("https://cloud.test/v1/sync/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "device_1", role: "owner" }),
      }),
    );
    expect(rejected).toEqual({ ok: false, status: 400, code: "invalid_request" });
  });

  it("refuses an oversized body before buffering it", async () => {
    const oversized = JSON.stringify({ deviceId: "d".repeat(4_096) });
    let bytesRead = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = new TextEncoder().encode(oversized.slice(bytesRead, bytesRead + 512));
        if (chunk.byteLength === 0) {
          controller.close();
          return;
        }
        bytesRead += 512;
        controller.enqueue(chunk);
      },
    });

    const streamed = await provisionInternals.readProvisionBody(
      new Request("https://cloud.test/v1/sync/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        duplex: "half",
      } as RequestInit),
    );
    expect(streamed).toEqual({ ok: false, status: 413, code: "request_too_large" });
    expect(bytesRead).toBeLessThan(oversized.length);

    const declared = await provisionInternals.readProvisionBody(
      new Request("https://cloud.test/v1/sync/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": "4096" },
        body: new ReadableStream<Uint8Array>({
          pull() {
            throw new Error("body must not be read");
          },
        }),
        duplex: "half",
      } as RequestInit),
    );
    expect(declared).toEqual({ ok: false, status: 413, code: "request_too_large" });
  });
});
