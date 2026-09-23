use skriuw_domain::WORKSPACE_SYNC_PROTOCOL_VERSION;

use crate::transport::TransportError;

/// Stable `Validation` detail for a 413 response: the workspace's cloud
/// storage quota or the request size ceiling was exceeded.
pub const VALIDATION_DETAIL_QUOTA_EXCEEDED: &str = "quota_exceeded";
/// Stable `Validation` detail for a 423 response: the workspace is end-to-end
/// encrypted and the service refused content that was not sealed under its
/// key.
pub const VALIDATION_DETAIL_WORKSPACE_ENCRYPTED: &str = "workspace_encrypted";

const REQUEST_TIMEOUT_BASE_MS: u64 = 10_000;
const REQUEST_TIMEOUT_PER_UNIT_MS: u64 = 1_000;
const REQUEST_TIMEOUT_UNIT_BYTES: u64 = 64 * 1024;
const REQUEST_TIMEOUT_CAP_MS: u64 = 180_000;

/// Per-request deadline shared by the desktop and browser transports:
/// 10 s plus 1 s for every started 64 KiB of request body, capped at 180 s,
/// so a large chunk upload on a slow link is not cut off by a fixed timeout
/// while an idle request still fails fast.
#[must_use]
pub fn request_timeout_ms(body_len: usize) -> u64 {
    let units = (body_len as u64).div_ceil(REQUEST_TIMEOUT_UNIT_BYTES);
    REQUEST_TIMEOUT_BASE_MS
        .saturating_add(units.saturating_mul(REQUEST_TIMEOUT_PER_UNIT_MS))
        .min(REQUEST_TIMEOUT_CAP_MS)
}

/// Transport-neutral URL layout of the workspace sync service. Both the
/// desktop HTTP transport and the browser worker transport build their
/// requests from this one contract so the two runtimes cannot drift apart on
/// endpoint shape.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncHttpEndpoints {
    base_url: String,
}

impl SyncHttpEndpoints {
    #[must_use]
    pub fn new(base_url: impl Into<String>) -> Self {
        let mut base_url: String = base_url.into();
        while base_url.ends_with('/') {
            base_url.pop();
        }
        Self { base_url }
    }

    #[must_use]
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    #[must_use]
    pub fn provision(&self) -> String {
        format!("{}/v1/sync/provision", self.base_url)
    }

    #[must_use]
    pub fn push(&self, workspace_id: &str) -> String {
        format!("{}/v1/workspaces/{workspace_id}/push", self.base_url)
    }

    #[must_use]
    pub fn pull(&self, workspace_id: &str, after_server_sequence: u64, limit: usize) -> String {
        format!(
            "{}/v1/workspaces/{workspace_id}/pull?syncProtocolVersion={WORKSPACE_SYNC_PROTOCOL_VERSION}&afterServerSequence={after_server_sequence}&limit={limit}",
            self.base_url
        )
    }

    #[must_use]
    pub fn chunk(&self, workspace_id: &str, digest: &str) -> String {
        format!(
            "{}/v1/workspaces/{workspace_id}/chunks/{digest}",
            self.base_url
        )
    }

    #[must_use]
    pub fn checkpoint(&self, workspace_id: &str) -> String {
        format!("{}/v1/workspaces/{workspace_id}/checkpoint", self.base_url)
    }

    #[must_use]
    pub fn encryption(&self, workspace_id: &str) -> String {
        format!("{}/v1/workspaces/{workspace_id}/encryption", self.base_url)
    }

    #[must_use]
    pub fn acknowledge(&self, workspace_id: &str) -> String {
        format!("{}/v1/workspaces/{workspace_id}/acknowledge", self.base_url)
    }

    /// WebSocket wake channel. The device identifies itself so the service can
    /// skip echoing its own pushes back to it.
    #[must_use]
    pub fn events(&self, workspace_id: &str, device_id: &str) -> String {
        format!(
            "{}/v1/workspaces/{workspace_id}/events?deviceId={device_id}",
            self.base_url
        )
    }
}

const VALIDATION_DETAIL_REQUEST_REJECTED: &str = "request_rejected";

/// Maps a non-success HTTP status to the stable transport failure
/// classification the coordinator's retry, pause, and status behavior depends
/// on. Every transport implementation must route rejected responses through
/// this function so native and browser runtimes react identically.
#[must_use]
pub fn classify_http_failure(status: u16, retry_after_ms: Option<i64>) -> TransportError {
    match status {
        401 => TransportError::AuthenticationRequired,
        403 | 404 => TransportError::AuthorizationDenied,
        409 => TransportError::Conflict("server_sequence_conflict".into()),
        410 => TransportError::LogTruncated,
        413 => TransportError::Validation(VALIDATION_DETAIL_QUOTA_EXCEEDED.into()),
        423 => TransportError::Validation(VALIDATION_DETAIL_WORKSPACE_ENCRYPTED.into()),
        429 => TransportError::RateLimited { retry_after_ms },
        400..=499 => TransportError::Validation(VALIDATION_DETAIL_REQUEST_REJECTED.into()),
        _ => TransportError::Server { retry_after_ms },
    }
}

/// Classifies a rejected response like [`classify_http_failure`], but keeps
/// the service's own error code as the validation detail instead of the
/// generic `request_rejected`, so a blocked sync names why it was refused.
#[must_use]
pub fn classify_rejected_response(
    status: u16,
    error_code: Option<&str>,
    retry_after_ms: Option<i64>,
) -> TransportError {
    match (classify_http_failure(status, retry_after_ms), error_code) {
        (TransportError::Validation(detail), Some(code))
            if detail == VALIDATION_DETAIL_REQUEST_REJECTED =>
        {
            TransportError::Validation(code.to_owned())
        }
        (failure, _) => failure,
    }
}

/// The stable public error code the service answers an unrecognized route
/// with. It is the only 404 that does not name a specific decision, which is
/// what lets a client tell an absent route apart from a denial.
pub const ERROR_CODE_NOT_FOUND: &str = "not_found";

/// Classifies a rejected response on a route older deployments do not serve.
///
/// The service answers 404 for two different facts: `workspace_access_denied`
/// is a deliberate decision about a route it does serve, while the generic
/// `not_found` code means the route itself is unknown to it. Only the latter
/// says the server is older than this client, so only it becomes
/// [`TransportError::RouteUnavailable`]; a 404 from something other than the
/// service carries no readable code and is treated the same way, because a
/// response that cannot be attributed to the service cannot prove a denial
/// either. Every other status keeps the shared classification.
#[must_use]
pub fn classify_optional_route_failure(
    status: u16,
    error_code: Option<&str>,
    retry_after_ms: Option<i64>,
) -> TransportError {
    if status == 404 && error_code.is_none_or(|code| code == ERROR_CODE_NOT_FOUND) {
        return TransportError::RouteUnavailable;
    }
    classify_http_failure(status, retry_after_ms)
}

/// Reads the stable `{ "error": "<code>" }` code out of a rejected response
/// body, or `None` when the body is not one the service wrote.
#[must_use]
pub fn rejected_error_code(body: &[u8]) -> Option<String> {
    #[derive(serde::Deserialize)]
    struct RejectedBody {
        error: String,
    }

    serde_json::from_slice::<RejectedBody>(body)
        .ok()
        .map(|body| body.error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_trailing_slashes_and_builds_versioned_urls() {
        let endpoints = SyncHttpEndpoints::new("https://cloud.example//");
        assert_eq!(
            endpoints.pull("w_1", 7, 25),
            format!(
                "https://cloud.example/v1/workspaces/w_1/pull?syncProtocolVersion={WORKSPACE_SYNC_PROTOCOL_VERSION}&afterServerSequence=7&limit=25"
            )
        );
        assert_eq!(
            endpoints.provision(),
            "https://cloud.example/v1/sync/provision"
        );
        assert_eq!(
            endpoints.chunk("w_1", "abc"),
            "https://cloud.example/v1/workspaces/w_1/chunks/abc"
        );
        assert_eq!(
            endpoints.encryption("w_1"),
            "https://cloud.example/v1/workspaces/w_1/encryption"
        );
        assert_eq!(
            endpoints.events("w_1", "device-1"),
            "https://cloud.example/v1/workspaces/w_1/events?deviceId=device-1"
        );
    }

    #[test]
    fn a_rejected_response_keeps_the_service_error_code() {
        assert_eq!(
            classify_rejected_response(400, Some("invalid_request"), None),
            TransportError::Validation("invalid_request".into())
        );
        assert_eq!(
            classify_rejected_response(400, None, None),
            TransportError::Validation("request_rejected".into())
        );
        assert_eq!(
            classify_rejected_response(401, Some("credential_expired"), None),
            TransportError::AuthenticationRequired
        );
    }

    #[test]
    fn an_unknown_route_is_classified_apart_from_a_denial() {
        assert_eq!(
            classify_optional_route_failure(404, Some(ERROR_CODE_NOT_FOUND), None),
            TransportError::RouteUnavailable
        );
        assert_eq!(
            classify_optional_route_failure(404, None, None),
            TransportError::RouteUnavailable
        );
        assert_eq!(
            classify_optional_route_failure(404, Some("workspace_access_denied"), None),
            TransportError::AuthorizationDenied
        );
        assert_eq!(
            classify_optional_route_failure(403, Some("workspace_permission_denied"), None),
            TransportError::AuthorizationDenied
        );
        assert_eq!(
            classify_optional_route_failure(401, None, None),
            TransportError::AuthenticationRequired
        );
        assert_eq!(
            classify_optional_route_failure(503, Some("sync_service_unavailable"), Some(1_000)),
            TransportError::Server {
                retry_after_ms: Some(1_000)
            }
        );
    }

    #[test]
    fn a_rejected_body_yields_only_the_stable_error_code() {
        assert_eq!(
            rejected_error_code(br#"{"error":"workspace_access_denied"}"#).as_deref(),
            Some("workspace_access_denied")
        );
        assert_eq!(rejected_error_code(b"<html>404</html>"), None);
        assert_eq!(rejected_error_code(b""), None);
    }

    #[test]
    fn classifies_statuses_like_the_desktop_transport() {
        assert_eq!(
            classify_http_failure(401, None),
            TransportError::AuthenticationRequired
        );
        assert_eq!(
            classify_http_failure(403, None),
            TransportError::AuthorizationDenied
        );
        assert_eq!(
            classify_http_failure(404, None),
            TransportError::AuthorizationDenied
        );
        assert!(matches!(
            classify_http_failure(409, None),
            TransportError::Conflict(_)
        ));
        assert_eq!(
            classify_http_failure(429, Some(2_000)),
            TransportError::RateLimited {
                retry_after_ms: Some(2_000)
            }
        );
        assert!(matches!(
            classify_http_failure(422, None),
            TransportError::Validation(_)
        ));
        assert_eq!(
            classify_http_failure(410, None),
            TransportError::LogTruncated
        );
        assert_eq!(
            classify_http_failure(413, None),
            TransportError::Validation(VALIDATION_DETAIL_QUOTA_EXCEEDED.into())
        );
        assert_eq!(
            classify_http_failure(423, None),
            TransportError::Validation(VALIDATION_DETAIL_WORKSPACE_ENCRYPTED.into())
        );
        assert_eq!(
            classify_http_failure(503, Some(1_000)),
            TransportError::Server {
                retry_after_ms: Some(1_000)
            }
        );
    }

    #[test]
    fn request_timeout_grows_with_the_body_and_stays_capped() {
        assert_eq!(request_timeout_ms(0), 10_000);
        assert_eq!(request_timeout_ms(1), 11_000);
        assert_eq!(request_timeout_ms(64 * 1024), 11_000);
        assert_eq!(request_timeout_ms(64 * 1024 + 1), 12_000);
        assert_eq!(request_timeout_ms(1024 * 1024), 26_000);
        assert_eq!(request_timeout_ms(64 * 1024 * 1024), 180_000);
        assert_eq!(request_timeout_ms(usize::MAX), 180_000);
    }
}
