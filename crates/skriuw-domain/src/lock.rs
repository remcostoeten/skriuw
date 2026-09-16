use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{OperationValidationError, validate_id, validate_timestamp};

/// The only sealing scheme locked note bodies are written with. It names the
/// same construction `skriuw-crypto` exposes for sync; the sqlite adapter
/// asserts the two strings agree.
pub const NOTE_LOCK_SCHEME: &str = "argon2id-xchacha20poly1305-v2";
pub const NOTE_LOCK_SALT_BYTES: usize = 16;
pub const NOTE_LOCK_KEY_BYTES: usize = 32;
pub const NOTE_LOCK_RECOVERY_ENTROPY_BYTES: usize = 20;
/// Entropy a caller must supply to configure a lock: the content key, the
/// recovery code, and the KDF salt, in that order.
pub const NOTE_LOCK_CONFIGURE_ENTROPY_BYTES: usize =
    NOTE_LOCK_KEY_BYTES + NOTE_LOCK_RECOVERY_ENTROPY_BYTES + NOTE_LOCK_SALT_BYTES;
pub const MIN_NOTE_LOCK_PIN_DIGITS: usize = 4;
pub const MIN_NOTE_LOCK_PASSPHRASE_CHARS: usize = 6;
pub const MAX_NOTE_LOCK_SECRET_BYTES: usize = 256;
pub const MAX_NOTE_LOCK_HINT_CHARS: usize = 120;
pub const MAX_SEALED_FIELD_BYTES: usize = 256;
/// Failed unlock attempts answered immediately before delays start.
pub const NOTE_LOCK_FREE_ATTEMPTS: u32 = 3;

/// The kind of secret protecting locked notes. A PIN is digits only, so the
/// unlock screen can show a numeric keypad; a passphrase is any text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NoteLockKind {
    Pin,
    Passphrase,
}

impl NoteLockKind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Pin => "pin",
            Self::Passphrase => "passphrase",
        }
    }

    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "pin" => Some(Self::Pin),
            "passphrase" => Some(Self::Passphrase),
            _ => None,
        }
    }
}

/// Ciphertext together with what is needed to open it, and never the key.
/// `ciphertext` and `nonce` are unpadded base64.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SealedPayload {
    pub scheme: String,
    pub key_id: String,
    pub nonce: String,
    pub ciphertext: String,
}

/// Everything a device needs to unlock the workspace's locked notes once it
/// knows the secret or the recovery code. Both wraps seal the same content
/// key, so either opens every locked note. Safe to replicate: without the
/// secret it is ciphertext.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NoteLockConfig {
    pub kind: NoteLockKind,
    pub key_id: String,
    pub kdf_salt: String,
    pub secret_wrap: SealedPayload,
    pub recovery_wrap: SealedPayload,
    #[serde(default)]
    pub hint: Option<String>,
    pub configured_at: i64,
}

/// What the renderer may know about the lock: whether one exists, whether
/// this session holds the key, and how the unlock screen should behave.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct NoteLockState {
    pub configured: bool,
    pub unlocked: bool,
    pub kind: Option<NoteLockKind>,
    pub hint: Option<String>,
    pub failed_attempts: u32,
    pub next_attempt_at: Option<i64>,
    pub locked_note_count: u32,
}

impl NoteLockState {
    #[must_use]
    pub const fn unconfigured() -> Self {
        Self {
            configured: false,
            unlocked: false,
            kind: None,
            hint: None,
            failed_attempts: 0,
            next_attempt_at: None,
            locked_note_count: 0,
        }
    }
}

/// The plaintext a locked note's sealed body opens to. Word count travels
/// inside so the stored row can show zero while locked.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LockedDocumentBody {
    pub document_json: Value,
    pub markdown: String,
    pub word_count: i64,
}

/// The empty document a locked note's row shows while its body is sealed.
#[must_use]
pub fn locked_document_placeholder() -> Value {
    serde_json::json!({ "type": "doc", "content": [] })
}

/// How long the next unlock attempt must wait after `failed_attempts`
/// consecutive failures. The first few are free so a typo costs nothing; after
/// that the delay grows quickly enough to make guessing at the keyboard
/// pointless, and caps so the owner is never locked out for good.
#[must_use]
pub fn unlock_retry_delay_ms(failed_attempts: u32) -> Option<i64> {
    const SECOND: i64 = 1_000;
    const MINUTE: i64 = 60 * SECOND;
    match failed_attempts {
        0..NOTE_LOCK_FREE_ATTEMPTS => None,
        3 => Some(30 * SECOND),
        4 => Some(2 * MINUTE),
        5 => Some(10 * MINUTE),
        _ => Some(30 * MINUTE),
    }
}

/// Checks a candidate secret against the rules for its kind, so both the set
/// and the change flows refuse the same inputs.
pub fn validate_note_lock_secret(kind: NoteLockKind, secret: &str) -> Result<(), String> {
    if secret.len() > MAX_NOTE_LOCK_SECRET_BYTES {
        return Err(format!(
            "The secret is too long; keep it under {MAX_NOTE_LOCK_SECRET_BYTES} bytes."
        ));
    }
    match kind {
        NoteLockKind::Pin => {
            if secret.chars().count() < MIN_NOTE_LOCK_PIN_DIGITS {
                return Err(format!(
                    "A PIN needs at least {MIN_NOTE_LOCK_PIN_DIGITS} digits."
                ));
            }
            if !secret.chars().all(|character| character.is_ascii_digit()) {
                return Err("A PIN contains digits only.".into());
            }
        }
        NoteLockKind::Passphrase => {
            if secret.trim().chars().count() < MIN_NOTE_LOCK_PASSPHRASE_CHARS {
                return Err(format!(
                    "A passphrase needs at least {MIN_NOTE_LOCK_PASSPHRASE_CHARS} characters."
                ));
            }
        }
    }
    Ok(())
}

pub fn validate_note_lock_hint(hint: Option<&str>) -> Result<(), OperationValidationError> {
    if let Some(hint) = hint
        && hint.chars().count() > MAX_NOTE_LOCK_HINT_CHARS
    {
        return Err(OperationValidationError::TooLong {
            field: "lock hint",
            maximum: MAX_NOTE_LOCK_HINT_CHARS,
        });
    }
    Ok(())
}

pub fn validate_sealed_payload(sealed: &SealedPayload) -> Result<(), OperationValidationError> {
    if sealed.scheme != NOTE_LOCK_SCHEME {
        return Err(OperationValidationError::InvalidIdentifier {
            field: "seal scheme",
        });
    }
    for (field, value) in [
        ("seal key id", &sealed.key_id),
        ("seal nonce", &sealed.nonce),
    ] {
        if value.is_empty() {
            return Err(OperationValidationError::Empty { field });
        }
        if value.len() > MAX_SEALED_FIELD_BYTES {
            return Err(OperationValidationError::TooLong {
                field,
                maximum: MAX_SEALED_FIELD_BYTES,
            });
        }
    }
    if sealed.ciphertext.is_empty() {
        return Err(OperationValidationError::Empty {
            field: "ciphertext",
        });
    }
    Ok(())
}

pub fn validate_note_lock_config(lock: &NoteLockConfig) -> Result<(), OperationValidationError> {
    if lock.key_id.is_empty() {
        return Err(OperationValidationError::Empty {
            field: "lock key id",
        });
    }
    if lock.kdf_salt.is_empty() {
        return Err(OperationValidationError::Empty { field: "lock salt" });
    }
    validate_sealed_payload(&lock.secret_wrap)?;
    validate_sealed_payload(&lock.recovery_wrap)?;
    if lock.secret_wrap.key_id == lock.key_id || lock.recovery_wrap.key_id == lock.key_id {
        return Err(OperationValidationError::InvalidIdentifier {
            field: "lock wrap key id",
        });
    }
    validate_note_lock_hint(lock.hint.as_deref())?;
    validate_timestamp(lock.configured_at)
}

pub(crate) fn validate_sealed_document(
    note_id: &str,
    sealed: &SealedPayload,
) -> Result<(), OperationValidationError> {
    validate_id("note id", note_id)?;
    validate_sealed_payload(sealed)
}

#[cfg(test)]
mod tests {
    use super::{
        NOTE_LOCK_SCHEME, NoteLockConfig, NoteLockKind, SealedPayload, unlock_retry_delay_ms,
        validate_note_lock_config, validate_note_lock_secret, validate_sealed_payload,
    };

    fn sealed(key_id: &str) -> SealedPayload {
        SealedPayload {
            scheme: NOTE_LOCK_SCHEME.into(),
            key_id: key_id.into(),
            nonce: "nonce".into(),
            ciphertext: "ct".into(),
        }
    }

    #[test]
    fn retry_delays_start_after_three_free_attempts_and_cap() {
        assert_eq!(unlock_retry_delay_ms(0), None);
        assert_eq!(unlock_retry_delay_ms(2), None);
        assert_eq!(unlock_retry_delay_ms(3), Some(30_000));
        assert_eq!(unlock_retry_delay_ms(4), Some(120_000));
        assert_eq!(unlock_retry_delay_ms(5), Some(600_000));
        assert_eq!(unlock_retry_delay_ms(6), Some(1_800_000));
        assert_eq!(unlock_retry_delay_ms(40), Some(1_800_000));
    }

    #[test]
    fn pins_are_digits_and_passphrases_have_a_floor() {
        assert!(validate_note_lock_secret(NoteLockKind::Pin, "1234").is_ok());
        assert!(validate_note_lock_secret(NoteLockKind::Pin, "123").is_err());
        assert!(validate_note_lock_secret(NoteLockKind::Pin, "12a4").is_err());
        assert!(validate_note_lock_secret(NoteLockKind::Passphrase, "open sesame").is_ok());
        assert!(validate_note_lock_secret(NoteLockKind::Passphrase, "  ab  ").is_err());
        assert!(validate_note_lock_secret(NoteLockKind::Passphrase, &"x".repeat(300)).is_err());
    }

    #[test]
    fn configs_need_both_wraps_under_other_keys() {
        let mut config = NoteLockConfig {
            kind: NoteLockKind::Pin,
            key_id: "content".into(),
            kdf_salt: "salt".into(),
            secret_wrap: sealed("secret-kek"),
            recovery_wrap: sealed("recovery-kek"),
            hint: Some("birthday".into()),
            configured_at: 1,
        };
        assert!(validate_note_lock_config(&config).is_ok());
        config.secret_wrap.key_id = "content".into();
        assert!(validate_note_lock_config(&config).is_err());
        config.secret_wrap.key_id = "secret-kek".into();
        config.hint = Some("h".repeat(200));
        assert!(validate_note_lock_config(&config).is_err());
    }

    #[test]
    fn sealed_payloads_refuse_other_schemes_and_empty_parts() {
        assert!(validate_sealed_payload(&sealed("k")).is_ok());
        let mut other = sealed("k");
        other.scheme = "argon2id-xchacha20poly1305-v1".into();
        assert!(validate_sealed_payload(&other).is_err());
        let mut empty = sealed("k");
        empty.ciphertext.clear();
        assert!(validate_sealed_payload(&empty).is_err());
    }
}
