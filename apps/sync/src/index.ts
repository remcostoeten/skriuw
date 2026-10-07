export { WorkspaceSyncObject } from "./workspace-sync-object";

import { productionSyncAccessConfiguration } from "./access";
import { WorkspaceContentStore } from "./content-store";
import {
  AUTH_FRESH_SESSION_AGE_SECONDS,
  createAuth,
  corsHeaders,
  handleAuthRequest,
  withHeaders,
} from "./auth";
import { SYNC_ROUTE_NAMES, handlePublicSyncRequest, logSyncSecurityEvent } from "./public-api";
import {
  SUPPORTED_SYNC_PROTOCOL_VERSIONS,
  WORKSPACE_DURABLE_OBJECT_SCHEMA_VERSION,
} from "./contracts";
import { handleSyncProvisionRequest, handleSyncWorkspaceStateRequest } from "./provision";
import { handleAccountDeletionRequest } from "./account-deletion";
import { handleNoteShareRequest, handlePublicShareRequest, newShareId } from "./note-shares";

function jsonError(status: number, code: string): Response {
  return Response.json({ error: code }, { status });
}

/**
 * Unauthenticated capability report. `status` and `publicSync` keep the shape
 * older clients already read; the rest lets a client, an operator, or the
 * release gate learn what this deployment serves before depending on it.
 * Every value is derived from the constants the Worker itself runs on, so the
 * report cannot claim a capability the code does not have.
 */
function healthReport() {
  return {
    status: "ok",
    publicSync: true,
    syncProtocolVersions: SUPPORTED_SYNC_PROTOCOL_VERSIONS,
    durableObjectSchemaVersion: WORKSPACE_DURABLE_OBJECT_SCHEMA_VERSION,
    routes: SYNC_ROUTE_NAMES,
    noteShares: true,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(healthReport());
    }
    if (url.pathname.startsWith("/shares/")) {
      return handlePublicShareRequest(request, env.AUTH_DB);
    }
    if (url.pathname.startsWith("/api/auth/")) {
      return handleAuthRequest(request, env);
    }
    if (url.pathname.startsWith("/v1/")) {
      const headers = corsHeaders(request, env);
      if (!headers) return jsonError(403, "origin_not_allowed");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      const accessConfiguration = productionSyncAccessConfiguration(env);
      function nowEpochSeconds() {
        return Math.floor(Date.now() / 1_000);
      }
      function resolveWorkspace(workspaceId: string) {
        return env.WORKSPACES.getByName(workspaceId);
      }
      const response =
        url.pathname === "/v1/shares" || url.pathname.startsWith("/v1/shares/")
          ? await handleNoteShareRequest(request, {
              accessConfiguration,
              database: env.AUTH_DB,
              publicOrigin: env.PUBLIC_SHARE_ORIGIN,
              nowEpochSeconds,
              newShareId,
            })
          : url.pathname === "/v1/sync/provision"
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
            : url.pathname === "/v1/account" && request.method === "DELETE"
              ? await handleAccountDeletionRequest(request, {
                  accessConfiguration,
                  database: env.AUTH_DB,
                    resolveWorkspace,
                    nowEpochSeconds,
                    hasFreshSession: async (headers) => {
                      const auth = await createAuth(env);
                      const session = await auth.api.getSession({ headers });
                      return (
                        session !== null &&
                        Date.now() - session.session.createdAt.getTime() <=
                          AUTH_FRESH_SESSION_AGE_SECONDS * 1_000
                      );
                    },
                    deleteAuthUser: async (headers) => {
                    const auth = await createAuth(env);
                    await auth.api.deleteUser({ headers, body: {} });
                  },
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
