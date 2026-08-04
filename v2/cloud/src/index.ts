export { WorkspaceSyncObject } from "./workspace-sync-object";

import { productionSyncAccessConfiguration } from "./access";
import { handlePublicSyncRequest, logSyncSecurityEvent } from "./public-api";

function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", publicSync: false });
    }
    if (url.pathname.startsWith("/v1/")) {
      return handlePublicSyncRequest(request, {
        accessConfiguration: productionSyncAccessConfiguration(),
        resolveWorkspace: (workspaceId) => env.WORKSPACES.getByName(workspaceId),
        log: logSyncSecurityEvent,
        nowEpochSeconds: () => Math.floor(Date.now() / 1_000),
      });
    }
    return jsonError(404, "not_found");
  },
} satisfies ExportedHandler<Env>;
