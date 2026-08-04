export type CredentialFailureCode =
  | "credential_invalid"
  | "credential_expired"
  | "credential_revoked";

export type SyncSecurityConfigurationErrorCode =
  | "sync_authentication_not_configured"
  | "sync_authorization_not_configured"
  | "sync_security_configuration_invalid";

export type WorkspaceRole = "owner" | "editor" | "viewer";
export type WorkspaceAction = "push" | "pull";

export type TrustedIdentity = {
  subject: string;
  sessionId: string;
  expiresAtEpochSeconds: number;
};

export type CredentialVerification =
  | { ok: true; identity: TrustedIdentity }
  | { ok: false; code: CredentialFailureCode };

export interface CredentialVerifier {
  verifyBearerToken(
    token: string,
    nowEpochSeconds: number,
  ): Promise<CredentialVerification>;
}

export type WorkspaceMembership = {
  role: WorkspaceRole;
  deviceIds: readonly string[];
};

export type WorkspaceMembershipLookup =
  | { state: "active"; membership: WorkspaceMembership }
  | { state: "denied" };

export interface WorkspaceMembershipSource {
  lookupMembership(
    trustedSubject: string,
    workspaceId: string,
  ): Promise<WorkspaceMembershipLookup>;
}

export type ReadySyncAccessConfiguration = {
  state: "ready";
  credentialVerifier: CredentialVerifier;
  membershipSource: WorkspaceMembershipSource;
};

export type SyncAccessConfiguration =
  | ReadySyncAccessConfiguration
  | {
      state: "unavailable";
      code: SyncSecurityConfigurationErrorCode;
    };

export type SyncAccessFailureCode =
  | SyncSecurityConfigurationErrorCode
  | "credential_missing"
  | "credential_malformed"
  | CredentialFailureCode
  | "sync_authentication_unavailable"
  | "invalid_workspace_identifier"
  | "workspace_access_denied"
  | "workspace_permission_denied"
  | "device_not_authorized"
  | "sync_authorization_unavailable";

export type AuthorizedWorkspaceAccess = {
  identity: TrustedIdentity;
  membership: WorkspaceMembership;
};

export type SyncAccessResult =
  | { ok: true; access: AuthorizedWorkspaceAccess }
  | { ok: false; code: SyncAccessFailureCode };

const MAX_AUTHORIZATION_HEADER_BYTES = 4_096;

export function productionSyncAccessConfiguration(): SyncAccessConfiguration {
  return {
    state: "unavailable",
    code: "sync_authentication_not_configured",
  };
}

export async function authorizeWorkspaceRequest(
  request: Request,
  workspaceId: string,
  action: WorkspaceAction,
  configuration: SyncAccessConfiguration,
  nowEpochSeconds: number,
): Promise<SyncAccessResult> {
  if (configuration.state === "unavailable") {
    return { ok: false, code: configuration.code };
  }

  const credential = readBearerCredential(request.headers);
  if (!credential.ok) {
    return credential;
  }

  let verification: CredentialVerification;
  try {
    verification = await configuration.credentialVerifier.verifyBearerToken(
      credential.token,
      nowEpochSeconds,
    );
  } catch {
    return { ok: false, code: "sync_authentication_unavailable" };
  }
  if (!verification.ok) {
    return verification;
  }
  if (!isTrustedIdentity(verification.identity)) {
    return { ok: false, code: "credential_invalid" };
  }
  if (verification.identity.expiresAtEpochSeconds <= nowEpochSeconds) {
    return { ok: false, code: "credential_expired" };
  }
  if (!isBoundDeviceId(workspaceId)) {
    return { ok: false, code: "invalid_workspace_identifier" };
  }

  let lookup: WorkspaceMembershipLookup;
  try {
    lookup = await configuration.membershipSource.lookupMembership(
      verification.identity.subject,
      workspaceId,
    );
  } catch {
    return { ok: false, code: "sync_authorization_unavailable" };
  }
  if (lookup.state === "denied") {
    return { ok: false, code: "workspace_access_denied" };
  }
  if (!isWorkspaceRole(lookup.membership.role)) {
    return { ok: false, code: "sync_authorization_unavailable" };
  }
  if (!roleAllows(lookup.membership.role, action)) {
    return { ok: false, code: "workspace_permission_denied" };
  }
  if (!lookup.membership.deviceIds.every(isBoundDeviceId)) {
    return { ok: false, code: "sync_authorization_unavailable" };
  }

  return {
    ok: true,
    access: {
      identity: verification.identity,
      membership: lookup.membership,
    },
  };
}

export function membershipAllowsDevice(
  membership: WorkspaceMembership,
  deviceId: string,
): boolean {
  return membership.deviceIds.includes(deviceId);
}

function readBearerCredential(
  headers: Headers,
): { ok: true; token: string } | { ok: false; code: SyncAccessFailureCode } {
  const authorization = headers.get("Authorization");
  if (authorization === null) {
    return { ok: false, code: "credential_missing" };
  }
  if (
    authorization.length > MAX_AUTHORIZATION_HEADER_BYTES ||
    !/^Bearer [^\s,]+$/.test(authorization)
  ) {
    return { ok: false, code: "credential_malformed" };
  }
  return { ok: true, token: authorization.slice("Bearer ".length) };
}

function isTrustedIdentity(identity: TrustedIdentity): boolean {
  return (
    isBoundedOpaqueValue(identity.subject) &&
    isBoundedOpaqueValue(identity.sessionId) &&
    Number.isSafeInteger(identity.expiresAtEpochSeconds) &&
    identity.expiresAtEpochSeconds > 0
  );
}

function isBoundedOpaqueValue(value: string): boolean {
  return value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}

function isBoundDeviceId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

function roleAllows(role: WorkspaceRole, action: WorkspaceAction): boolean {
  if (action === "pull") {
    return true;
  }
  return role === "owner" || role === "editor";
}

function isWorkspaceRole(value: string): value is WorkspaceRole {
  return value === "owner" || value === "editor" || value === "viewer";
}
