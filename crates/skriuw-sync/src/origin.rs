//! Which cloud origins and session credentials a runtime trusts.
//!
//! Every runtime that holds a bearer credential re-checks the origin it is
//! told to send it to, so a compromised renderer or JavaScript message cannot
//! point the credential at an arbitrary host. The suffix rule is shared; each
//! platform only names the development hosts its builds may reach.

use thiserror::Error;

/// Longest session credential any runtime accepts.
pub const MAX_SESSION_TOKEN_BYTES: usize = 4_096;
/// Longest cloud base URL any runtime accepts.
pub const MAX_CLOUD_BASE_URL_BYTES: usize = 2_048;

const TRUSTED_HOST_SUFFIXES: [&str; 2] = [".skriuw.app", ".workers.dev"];

/// Development origins a build may send the credential to over plain HTTP, in
/// addition to the `https` Skriuw suffixes every build trusts. Release builds
/// pass [`CloudOriginPolicy::RELEASE`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CloudOriginPolicy {
    pub development_origins: &'static [&'static str],
}

impl CloudOriginPolicy {
    pub const RELEASE: Self = Self {
        development_origins: &[],
    };
    pub const LOCALHOST: Self = Self {
        development_origins: &["http://localhost"],
    };
    /// `10.0.2.2` is the Android emulator's route to the host machine.
    pub const MOBILE_DEVELOPMENT: Self = Self {
        development_origins: &["http://localhost", "http://127.0.0.1", "http://10.0.2.2"],
    };
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
#[error("the cloud sync URL is not trusted")]
pub struct UntrustedCloudOrigin;

/// A cloud base URL a runtime may send the bearer credential to. Only
/// [`trusted_cloud_base_url`] and the explicit developer override produce one,
/// so holding one proves the check ran.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrustedCloudOrigin(String);

impl TrustedCloudOrigin {
    /// Trusts `base_url` without checking it. Only for an origin a developer
    /// configured in a debug build, never for one a shell message named.
    #[must_use]
    pub fn developer_override(base_url: String) -> Self {
        Self(base_url)
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Returns the normalized origin when `base_url` is one this policy trusts
/// with the bearer credential: `https` under a Skriuw-controlled suffix, or one
/// of the policy's development origins.
pub fn trusted_cloud_base_url(
    base_url: &str,
    policy: CloudOriginPolicy,
) -> Result<TrustedCloudOrigin, UntrustedCloudOrigin> {
    let trimmed = base_url.trim().trim_end_matches('/');
    let trusted = trimmed.len() <= MAX_CLOUD_BASE_URL_BYTES
        && !trimmed.contains(['?', '#', '@', ' '])
        && (is_trusted_https_origin(trimmed)
            || is_development_origin(trimmed, policy.development_origins));
    if trusted {
        Ok(TrustedCloudOrigin(trimmed.to_string()))
    } else {
        Err(UntrustedCloudOrigin)
    }
}

/// A credential is non-blank, bounded and free of control characters, so it
/// can travel as a header without being reinterpreted.
#[must_use]
pub fn is_well_formed_session_token(token: &str) -> bool {
    !token.trim().is_empty()
        && token.len() <= MAX_SESSION_TOKEN_BYTES
        && !token.chars().any(char::is_control)
}

fn is_trusted_https_origin(base_url: &str) -> bool {
    let Some(rest) = base_url.strip_prefix("https://") else {
        return false;
    };
    let host = rest.split(['/', ':']).next().unwrap_or_default();
    !host.is_empty()
        && TRUSTED_HOST_SUFFIXES
            .iter()
            .any(|suffix| host.ends_with(suffix))
}

fn is_development_origin(base_url: &str, origins: &[&str]) -> bool {
    origins.iter().any(|origin| {
        base_url
            .strip_prefix(origin)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with(':') || rest.starts_with('/'))
    })
}

#[cfg(test)]
mod tests {
    use super::{CloudOriginPolicy, is_well_formed_session_token, trusted_cloud_base_url};

    fn trusted(url: &str, policy: CloudOriginPolicy) -> bool {
        trusted_cloud_base_url(url, policy).is_ok()
    }

    #[test]
    fn only_skriuw_https_origins_are_trusted_in_release() {
        let release = CloudOriginPolicy::RELEASE;
        assert!(trusted(
            "https://skriuw-v2-cloud.remcostoeten.workers.dev",
            release
        ));
        assert!(trusted("https://sync.skriuw.app", release));
        assert!(!trusted("https://evil.example", release));
        assert!(!trusted("https://skriuw.app.evil.example", release));
        assert!(!trusted("http://sync.skriuw.app", release));
        assert!(!trusted("https://sync.skriuw.app?x=1", release));
        assert!(!trusted("https://user@sync.skriuw.app", release));
        assert!(!trusted("http://localhost:8787", release));
    }

    #[test]
    fn development_origins_are_matched_as_whole_hosts() {
        let local = CloudOriginPolicy::LOCALHOST;
        assert!(trusted("http://localhost", local));
        assert!(trusted("http://localhost:8787", local));
        assert!(!trusted("http://localhost.evil.example", local));
        assert!(!trusted("http://10.0.2.2:8787", local));

        let mobile = CloudOriginPolicy::MOBILE_DEVELOPMENT;
        assert!(trusted("http://10.0.2.2:8787", mobile));
        assert!(trusted("http://127.0.0.1:8787", mobile));
        assert!(!trusted("http://10.0.2.20:8787", mobile));
    }

    #[test]
    fn a_trusted_origin_is_normalized() {
        assert_eq!(
            trusted_cloud_base_url(" https://sync.skriuw.app/ ", CloudOriginPolicy::RELEASE)
                .expect("trusted")
                .as_str(),
            "https://sync.skriuw.app",
        );
    }

    #[test]
    fn a_malformed_credential_is_refused() {
        assert!(!is_well_formed_session_token(""));
        assert!(!is_well_formed_session_token("   "));
        assert!(!is_well_formed_session_token("with\nnewline"));
        assert!(!is_well_formed_session_token(&"a".repeat(4_097)));
        assert!(is_well_formed_session_token("token"));
    }
}
