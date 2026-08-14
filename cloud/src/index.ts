export { WorkspaceSyncObject } from "./workspace-sync-object";

import { productionSyncAccessConfiguration } from "./access";
import { WorkspaceContentStore } from "./content-store";
import { corsHeaders, handleAuthRequest, withHeaders } from "./auth";
import { handlePublicSyncRequest, logSyncSecurityEvent } from "./public-api";
import {
  handleSyncProvisionRequest,
  handleSyncWorkspaceStateRequest,
} from "./provision";

function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", publicSync: true });
    }
    if (url.pathname.startsWith("/api/auth/")) {
      return handleAuthRequest(request, env);
    }
    if (url.pathname.startsWith("/v1/")) {
      const headers = corsHeaders(request, env);
      if (!headers) return jsonError(403, "origin_not_allowed");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      const accessConfiguration = productionSyncAccessConfiguration(env);
      const nowEpochSeconds = () => Math.floor(Date.now() / 1_000);
      const resolveWorkspace = (workspaceId: string) => env.WORKSPACES.getByName(workspaceId);
      const response = url.pathname === "/v1/sync/provision"
        ? await handleSyncProvisionRequest(request, {
            accessConfiguration,
            database: env.AUTH_DB,
            nowEpochSeconds,
          })
        : url.pathname === "/v1/sync/state"
          ? await handleSyncWorkspaceStateRequest(request, {
              accessConfiguration,
              resolveWorkspace,
              nowEpochSeconds,
            })
          : await handlePublicSyncRequest(request, {
              accessConfiguration,
              resolveWorkspace,
              contentStore: new WorkspaceContentStore(env.SYNC_CONTENT),
              log: logSyncSecurityEvent,
              nowEpochSeconds,
            });
      if (response.status === 101) {
        return response;
      }
      return withHeaders(response, headers);
    }
    return jsonError(404, "not_found");
  },
} satisfies ExportedHandler<Env>;
