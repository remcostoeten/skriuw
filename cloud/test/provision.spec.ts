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
});
