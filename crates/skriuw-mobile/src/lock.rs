//! Note locking (ADR-0044) over the foreign-function boundary.
//!
//! Every call is the existing `NoteLockAccess` use case run on the storage
//! thread through `WorkspaceRuntime::note_lock`, the same path the desktop
//! commands take. Key derivation, sealing and the attempt delay stay inside
//! `skriuw-sqlite`; the only key material that leaves Rust is a document the
//! lock session already opened, and the recovery code exactly once.

use std::fmt;

use skriuw_domain::{NOTE_LOCK_CONFIGURE_ENTROPY_BYTES, NoteLockKind};
use skriuw_storage::{ConfigureNoteLockRequest, ReplaceNoteLockSecretRequest};
use zeroize::Zeroizing;

use crate::{
    boundary::{guarded, now_millis},
    error::MobileError,
    workspace::{MobileWorkspace, encode},
};

/// A secret to install, as `NoteLockSecretInput` in the generated contract.
/// `kind` is `"pin"` or `"passphrase"`; the secret's shape is validated by the
/// core, not here.
#[derive(uniffi::Record)]
pub struct NoteLockSecret {
    pub kind: String,
    pub secret: String,
    pub hint: Option<String>,
}

impl fmt::Debug for NoteLockSecret {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("NoteLockSecret")
            .field("kind", &self.kind)
            .field("hint", &self.hint)
            .field("secret", &"<redacted>")
            .finish()
    }
}

impl NoteLockSecret {
    fn into_request(self) -> Result<ReplaceNoteLockSecretRequest, MobileError> {
        let kind = NoteLockKind::parse(&self.kind).ok_or_else(|| {
            MobileError::invalid_payload(format!("unknown note lock kind {}", self.kind))
        })?;
        Ok(ReplaceNoteLockSecretRequest {
            kind,
            secret: self.secret,
            hint: self.hint,
        })
    }
}

#[uniffi::export]
impl MobileWorkspace {
    /// `NoteLockState` JSON: whether a lock exists, whether this session holds
    /// the key, and the attempt delay the unlock screen should show.
    pub fn note_lock_state(&self) -> Result<String, MobileError> {
        guarded(|| {
            let now = now_millis();
            let state = self
                .runtime()?
                .note_lock(move |lock| lock.note_lock_state(now))?
                .wait()?;
            encode(&state)
        })
    }

    /// Installs the lock and returns the recovery code, which the core never
    /// shows again. The session is unlocked afterwards. The entropy comes from
    /// the operating system here, as the desktop command gathers it.
    pub fn configure_note_lock(&self, secret: NoteLockSecret) -> Result<String, MobileError> {
        guarded(|| {
            let replacement = secret.into_request()?;
            let mut entropy = Zeroizing::new(vec![0_u8; NOTE_LOCK_CONFIGURE_ENTROPY_BYTES]);
            getrandom::fill(entropy.as_mut_slice()).map_err(|error| {
                MobileError::internal(format!(
                    "could not gather randomness for the note lock: {error}"
                ))
            })?;
            let request = ConfigureNoteLockRequest {
                kind: replacement.kind,
                secret: replacement.secret,
                hint: replacement.hint,
                entropy: entropy.to_vec(),
            };
            let now = now_millis();
            Ok(self
                .runtime()?
                .note_lock(move |lock| lock.configure_note_lock(request, now))?
                .wait()?)
        })
    }

    /// Opens the session and returns `NoteLockState` JSON. A wrong secret is
    /// counted and comes back as `Rejected` with the core's own message,
    /// including the delay once the free attempts are spent.
    pub fn unlock_note_lock(&self, secret: String) -> Result<String, MobileError> {
        guarded(|| {
            let now = now_millis();
            let state = self
                .runtime()?
                .note_lock(move |lock| lock.unlock_note_lock(&secret, now))?
                .wait()?;
            encode(&state)
        })
    }

    /// Opens the session with the recovery code, installs `replacement`, and
    /// returns `NoteLockState` JSON.
    pub fn recover_note_lock(
        &self,
        recovery_code: String,
        replacement: NoteLockSecret,
    ) -> Result<String, MobileError> {
        guarded(|| {
            let request = replacement.into_request()?;
            let now = now_millis();
            let state = self
                .runtime()?
                .note_lock(move |lock| lock.recover_note_lock(&recovery_code, request, now))?
                .wait()?;
            encode(&state)
        })
    }

    /// Replaces the secret of an unlocked session; `NoteLockState` JSON.
    pub fn change_note_lock_secret(
        &self,
        replacement: NoteLockSecret,
    ) -> Result<String, MobileError> {
        guarded(|| {
            let request = replacement.into_request()?;
            let now = now_millis();
            let state = self
                .runtime()?
                .note_lock(move |lock| lock.change_note_lock_secret(request, now))?
                .wait()?;
            encode(&state)
        })
    }

    /// Drops the session key, so locked notes read as placeholders again;
    /// `NoteLockState` JSON.
    pub fn relock_note_lock(&self) -> Result<String, MobileError> {
        guarded(|| {
            let state = self
                .runtime()?
                .note_lock(|lock| lock.relock_note_lock())?
                .wait()?;
            encode(&state)
        })
    }

    /// The opened bodies of locked notes, all of them or only `note_ids`, as
    /// `WorkspaceDocument[]` JSON. Requires an unlocked session.
    pub fn read_locked_documents(
        &self,
        note_ids: Option<Vec<String>>,
    ) -> Result<String, MobileError> {
        guarded(|| {
            let documents = self
                .runtime()?
                .note_lock(move |lock| lock.read_locked_documents(note_ids.as_deref()))?
                .wait()?;
            encode(&documents)
        })
    }

    /// Unlocks every locked note permanently and removes the lock; the
    /// `OperationAck` JSON. Requires an unlocked session.
    pub fn remove_note_lock(&self) -> Result<String, MobileError> {
        guarded(|| {
            let now = now_millis();
            let acknowledgement = self
                .runtime()?
                .note_lock(move |lock| lock.remove_note_lock(now))?
                .wait()?;
            encode(&acknowledgement)
        })
    }
}
