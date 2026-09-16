//! Note locking: a workspace-wide secret whose derived key seals the bodies of
//! locked notes at rest. The lock content key is random; the secret and the
//! recovery code each wrap it, and only the wraps are stored. The opened key
//! lives in [`LockSession`] for the process lifetime at most.

use std::sync::{Mutex, MutexGuard};

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use skriuw_crypto::{
    ContentKey, CryptoError, RecoveryCode, SEAL_SCHEME_V2, decode_base64,
    derive_key_from_recovery_code, derive_key_from_secret, encode_base64, open, seal,
};
use skriuw_domain::{
    LockedDocumentBody, NOTE_LOCK_CONFIGURE_ENTROPY_BYTES, NOTE_LOCK_KEY_BYTES,
    NOTE_LOCK_RECOVERY_ENTROPY_BYTES, NOTE_LOCK_SALT_BYTES, NOTE_LOCK_SCHEME, NodeKind,
    NodePlacement, NoteLockConfig, NoteLockKind, NoteLockState, SealedPayload, WorkspaceDocument,
    WorkspaceOperation, WorkspaceOperationEnvelope, locked_document_placeholder,
    unlock_retry_delay_ms, validate_note_lock_hint, validate_note_lock_secret,
};
use skriuw_storage::{ConfigureNoteLockRequest, ReplaceNoteLockSecretRequest, StorageError};

use crate::error::{backend, json_backend};

const SECRET_WRAP_CONTEXT: &str = "skriuw/lock/key/secret";
const RECOVERY_WRAP_CONTEXT: &str = "skriuw/lock/key/recovery";

const _: () = assert!(
    NOTE_LOCK_SCHEME.len() == SEAL_SCHEME_V2.len(),
    "the domain and crypto crates must agree on the sealing scheme"
);

fn document_context(note_id: &str) -> String {
    format!("skriuw/lock/document/{note_id}")
}

/// The opened lock key for this process, or nothing while the session is
/// locked. Never persisted.
#[derive(Default)]
pub struct LockSession {
    key: Mutex<Option<ContentKey>>,
}

impl LockSession {
    pub(crate) fn guard(&self) -> Result<MutexGuard<'_, Option<ContentKey>>, StorageError> {
        self.key
            .lock()
            .map_err(|_| StorageError::Backend("note lock session poisoned".into()))
    }

    pub(crate) fn key(&self) -> Result<Option<ContentKey>, StorageError> {
        Ok(self.guard()?.clone())
    }

    pub(crate) fn set(&self, key: Option<ContentKey>) -> Result<(), StorageError> {
        *self.guard()? = key;
        Ok(())
    }
}

pub(crate) struct StoredLock {
    pub(crate) config: NoteLockConfig,
    pub(crate) failed_attempts: u32,
    pub(crate) next_attempt_at: Option<i64>,
}

pub(crate) fn read_lock(connection: &Connection) -> Result<Option<StoredLock>, StorageError> {
    connection
        .query_row(
            "SELECT kind, key_id, kdf_salt, secret_wrap_json, recovery_wrap_json, hint, \
             configured_at, failed_attempts, next_attempt_at FROM note_lock WHERE singleton = 1",
            [],
            |row| {
                let kind_raw = row.get::<_, String>(0)?;
                let kind = NoteLockKind::parse(&kind_raw).ok_or_else(|| {
                    rusqlite::Error::FromSqlConversionFailure(
                        0,
                        rusqlite::types::Type::Text,
                        format!("unknown note lock kind {kind_raw}").into(),
                    )
                })?;
                let secret_wrap = parse_wrap(row.get::<_, String>(3)?, 3)?;
                let recovery_wrap = parse_wrap(row.get::<_, String>(4)?, 4)?;
                Ok(StoredLock {
                    config: NoteLockConfig {
                        kind,
                        key_id: row.get(1)?,
                        kdf_salt: row.get(2)?,
                        secret_wrap,
                        recovery_wrap,
                        hint: row.get(5)?,
                        configured_at: row.get(6)?,
                    },
                    failed_attempts: row.get::<_, i64>(7)?.max(0) as u32,
                    next_attempt_at: row.get(8)?,
                })
            },
        )
        .optional()
        .map_err(backend)
}

fn parse_wrap(raw: String, column: usize) -> rusqlite::Result<SealedPayload> {
    serde_json::from_str(&raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

/// Installs or replaces the lock configuration. Attempt counters are device
/// state and survive a replaced configuration.
pub(crate) fn write_lock_config(
    transaction: &Transaction<'_>,
    config: &NoteLockConfig,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "INSERT INTO note_lock (singleton, kind, key_id, kdf_salt, secret_wrap_json, \
                 recovery_wrap_json, hint, configured_at, failed_attempts, next_attempt_at) \
             VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, NULL) \
             ON CONFLICT(singleton) DO UPDATE SET \
                 kind = excluded.kind, key_id = excluded.key_id, kdf_salt = excluded.kdf_salt, \
                 secret_wrap_json = excluded.secret_wrap_json, \
                 recovery_wrap_json = excluded.recovery_wrap_json, hint = excluded.hint, \
                 configured_at = excluded.configured_at",
            params![
                config.kind.as_str(),
                config.key_id,
                config.kdf_salt,
                serde_json::to_string(&config.secret_wrap).map_err(json_backend)?,
                serde_json::to_string(&config.recovery_wrap).map_err(json_backend)?,
                config.hint,
                config.configured_at,
            ],
        )
        .map_err(backend)?;
    Ok(())
}

pub(crate) fn delete_lock(transaction: &Transaction<'_>) -> Result<(), StorageError> {
    transaction
        .execute("DELETE FROM note_lock WHERE singleton = 1", [])
        .map_err(backend)?;
    Ok(())
}

pub(crate) fn locked_node_count(connection: &Connection) -> Result<u32, StorageError> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM workspace_nodes WHERE locked_at IS NOT NULL",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count.max(0) as u32)
        .map_err(backend)
}

fn locked_note_count(connection: &Connection) -> Result<u32, StorageError> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM workspace_nodes \
             WHERE locked_at IS NOT NULL AND kind = 'note' AND deleted_at IS NULL",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count.max(0) as u32)
        .map_err(backend)
}

pub(crate) fn lock_state(
    connection: &Connection,
    unlocked: bool,
    now_ms: i64,
) -> Result<NoteLockState, StorageError> {
    let Some(stored) = read_lock(connection)? else {
        return Ok(NoteLockState {
            locked_note_count: locked_note_count(connection)?,
            ..NoteLockState::unconfigured()
        });
    };
    Ok(NoteLockState {
        configured: true,
        unlocked,
        kind: Some(stored.config.kind),
        hint: stored.config.hint,
        failed_attempts: stored.failed_attempts,
        next_attempt_at: stored.next_attempt_at.filter(|at| *at > now_ms),
        locked_note_count: locked_note_count(connection)?,
    })
}

fn record_failed_attempt(
    connection: &Connection,
    now_ms: i64,
) -> Result<(u32, Option<i64>), StorageError> {
    let attempts = connection
        .query_row(
            "UPDATE note_lock SET failed_attempts = failed_attempts + 1 WHERE singleton = 1 \
             RETURNING failed_attempts",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(backend)?
        .max(0) as u32;
    let next_attempt_at = unlock_retry_delay_ms(attempts).map(|delay| now_ms.saturating_add(delay));
    connection
        .execute(
            "UPDATE note_lock SET next_attempt_at = ?1 WHERE singleton = 1",
            [next_attempt_at],
        )
        .map_err(backend)?;
    Ok((attempts, next_attempt_at))
}

fn reset_attempts(connection: &Connection) -> Result<(), StorageError> {
    connection
        .execute(
            "UPDATE note_lock SET failed_attempts = 0, next_attempt_at = NULL WHERE singleton = 1",
            [],
        )
        .map_err(backend)?;
    Ok(())
}

fn crypto_error(error: CryptoError) -> StorageError {
    StorageError::InvalidOperation(error.to_string())
}

fn sealed_payload(sealed: skriuw_crypto::SealedBytes, key_id: String) -> SealedPayload {
    let ciphertext = sealed.ciphertext_base64();
    SealedPayload {
        scheme: SEAL_SCHEME_V2.into(),
        key_id,
        nonce: sealed.nonce,
        ciphertext,
    }
}

pub(crate) fn seal_document(
    key: &ContentKey,
    note_id: &str,
    body: &LockedDocumentBody,
) -> Result<SealedPayload, StorageError> {
    let plaintext = serde_json::to_vec(body).map_err(json_backend)?;
    let sealed = seal(key, &document_context(note_id), &plaintext).map_err(crypto_error)?;
    Ok(sealed_payload(sealed, key.key_id()))
}

pub(crate) fn open_document(
    key: &ContentKey,
    note_id: &str,
    sealed: &SealedPayload,
) -> Result<LockedDocumentBody, StorageError> {
    let ciphertext = decode_base64(&sealed.ciphertext).map_err(crypto_error)?;
    let plaintext = open(
        key,
        &sealed.scheme,
        &sealed.key_id,
        &document_context(note_id),
        &sealed.nonce,
        &ciphertext,
    )
    .map_err(|error| match error {
        CryptoError::WrongKey { .. } => StorageError::InvalidOperation(format!(
            "note {note_id} was locked with a different lock key than this device holds"
        )),
        other => crypto_error(other),
    })?;
    serde_json::from_slice(&plaintext).map_err(json_backend)
}

fn wrap_key(
    kek: &ContentKey,
    content: &ContentKey,
    context: &str,
) -> Result<SealedPayload, StorageError> {
    let sealed = seal(kek, context, content.material()).map_err(crypto_error)?;
    Ok(sealed_payload(sealed, kek.key_id()))
}

fn unwrap_key(
    kek: &ContentKey,
    wrap: &SealedPayload,
    context: &str,
) -> Result<ContentKey, StorageError> {
    let ciphertext = decode_base64(&wrap.ciphertext).map_err(crypto_error)?;
    let material = zeroize::Zeroizing::new(
        open(
            kek,
            &wrap.scheme,
            &wrap.key_id,
            context,
            &wrap.nonce,
            &ciphertext,
        )
        .map_err(crypto_error)?,
    );
    ContentKey::from_material(&material).map_err(crypto_error)
}

fn salt_bytes(config: &NoteLockConfig) -> Result<Vec<u8>, StorageError> {
    decode_base64(&config.kdf_salt).map_err(crypto_error)
}

/// The wrapped configuration for `content` under a fresh secret. `recovery`
/// and `salt` carry over unchanged so the recovery code shown at setup keeps
/// working after the secret changes.
fn build_config(
    kind: NoteLockKind,
    secret: &str,
    hint: Option<String>,
    content: &ContentKey,
    recovery_wrap: SealedPayload,
    salt: &[u8],
    configured_at: i64,
) -> Result<NoteLockConfig, StorageError> {
    validate_note_lock_secret(kind, secret).map_err(StorageError::InvalidOperation)?;
    let hint = hint
        .map(|hint| hint.trim().to_owned())
        .filter(|hint| !hint.is_empty());
    validate_note_lock_hint(hint.as_deref())
        .map_err(|error| StorageError::InvalidOperation(error.to_string()))?;
    let kek = derive_key_from_secret(secret.as_bytes(), salt).map_err(crypto_error)?;
    Ok(NoteLockConfig {
        kind,
        key_id: content.key_id(),
        kdf_salt: encode_base64(salt),
        secret_wrap: wrap_key(&kek, content, SECRET_WRAP_CONTEXT)?,
        recovery_wrap,
        hint,
        configured_at,
    })
}

/// Splits caller entropy into the content key, the recovery code, and the
/// salt, and returns the configuration to install plus the code to show once.
pub(crate) fn configure(
    request: &ConfigureNoteLockRequest,
    now_ms: i64,
) -> Result<(NoteLockConfig, ContentKey, String), StorageError> {
    if request.entropy.len() != NOTE_LOCK_CONFIGURE_ENTROPY_BYTES {
        return Err(StorageError::InvalidOperation(format!(
            "a note lock needs exactly {NOTE_LOCK_CONFIGURE_ENTROPY_BYTES} bytes of entropy"
        )));
    }
    let (key_bytes, rest) = request.entropy.split_at(NOTE_LOCK_KEY_BYTES);
    let (code_bytes, salt) = rest.split_at(NOTE_LOCK_RECOVERY_ENTROPY_BYTES);
    debug_assert_eq!(salt.len(), NOTE_LOCK_SALT_BYTES);
    let content = ContentKey::from_material(key_bytes).map_err(crypto_error)?;
    let recovery_code = RecoveryCode::from_entropy(code_bytes).map_err(crypto_error)?;
    let recovery_kek = derive_key_from_recovery_code(&recovery_code, salt).map_err(crypto_error)?;
    let recovery_wrap = wrap_key(&recovery_kek, &content, RECOVERY_WRAP_CONTEXT)?;
    let config = build_config(
        request.kind,
        &request.secret,
        request.hint.clone(),
        &content,
        recovery_wrap,
        salt,
        now_ms,
    )?;
    Ok((config, content, recovery_code.formatted()))
}

pub(crate) enum UnlockOutcome {
    Opened(ContentKey),
    Refused { next_attempt_at: Option<i64> },
}

pub(crate) fn throttle_error(next_attempt_at: i64, now_ms: i64) -> StorageError {
    let remaining_ms = next_attempt_at.saturating_sub(now_ms).max(0);
    let remaining = if remaining_ms >= 60_000 {
        let minutes = (remaining_ms + 59_999) / 60_000;
        format!("{minutes} minute{}", if minutes == 1 { "" } else { "s" })
    } else {
        let seconds = (remaining_ms + 999) / 1_000;
        format!("{seconds} second{}", if seconds == 1 { "" } else { "s" })
    };
    StorageError::InvalidOperation(format!("Too many attempts. Try again in {remaining}."))
}

/// Derives the secret's key and tries to unwrap the content key. Runs without
/// the connection so the memory-hard derivation never blocks other writes.
pub(crate) fn try_unlock(
    stored: &StoredLock,
    secret: &str,
) -> Result<Option<ContentKey>, StorageError> {
    let salt = salt_bytes(&stored.config)?;
    let kek = derive_key_from_secret(secret.as_bytes(), &salt).map_err(crypto_error)?;
    match unwrap_key(&kek, &stored.config.secret_wrap, SECRET_WRAP_CONTEXT) {
        Ok(content) if content.key_id() == stored.config.key_id => Ok(Some(content)),
        Ok(_) => Ok(None),
        Err(StorageError::InvalidOperation(_)) => Ok(None),
        Err(other) => Err(other),
    }
}

pub(crate) fn record_unlock_attempt(
    connection: &Connection,
    opened: Option<ContentKey>,
    now_ms: i64,
) -> Result<UnlockOutcome, StorageError> {
    match opened {
        Some(key) => {
            reset_attempts(connection)?;
            Ok(UnlockOutcome::Opened(key))
        }
        None => {
            let (_, next_attempt_at) = record_failed_attempt(connection, now_ms)?;
            Ok(UnlockOutcome::Refused { next_attempt_at })
        }
    }
}

pub(crate) fn wrong_secret_error(
    kind: NoteLockKind,
    next_attempt_at: Option<i64>,
    now_ms: i64,
) -> StorageError {
    let what = match kind {
        NoteLockKind::Pin => "PIN",
        NoteLockKind::Passphrase => "passphrase",
    };
    match next_attempt_at {
        Some(at) if at > now_ms => {
            let StorageError::InvalidOperation(wait) = throttle_error(at, now_ms) else {
                unreachable!("throttle errors are invalid-operation errors");
            };
            StorageError::InvalidOperation(format!("Wrong {what}. {wait}"))
        }
        _ => StorageError::InvalidOperation(format!("Wrong {what}.")),
    }
}

/// Opens the content key from the recovery code.
pub(crate) fn recover(
    stored: &StoredLock,
    recovery_code: &str,
) -> Result<ContentKey, StorageError> {
    let code = RecoveryCode::parse(recovery_code).map_err(|_| {
        StorageError::InvalidOperation("That is not a Skriuw recovery code.".into())
    })?;
    let salt = salt_bytes(&stored.config)?;
    let kek = derive_key_from_recovery_code(&code, &salt).map_err(crypto_error)?;
    let content =
        unwrap_key(&kek, &stored.config.recovery_wrap, RECOVERY_WRAP_CONTEXT).map_err(|_| {
            StorageError::InvalidOperation("That recovery code does not open this lock.".into())
        })?;
    if content.key_id() != stored.config.key_id {
        return Err(StorageError::InvalidOperation(
            "That recovery code does not open this lock.".into(),
        ));
    }
    Ok(content)
}

/// The configuration that installs a new secret over the existing key.
pub(crate) fn replace_secret(
    stored: &StoredLock,
    content: &ContentKey,
    request: &ReplaceNoteLockSecretRequest,
    now_ms: i64,
) -> Result<NoteLockConfig, StorageError> {
    if content.key_id() != stored.config.key_id {
        return Err(StorageError::InvalidOperation(
            "the session key does not match the stored lock".into(),
        ));
    }
    let salt = salt_bytes(&stored.config)?;
    build_config(
        request.kind,
        &request.secret,
        request.hint.clone(),
        content,
        stored.config.recovery_wrap.clone(),
        &salt,
        now_ms,
    )
}

pub(crate) struct SealedRow {
    pub(crate) note_id: String,
    pub(crate) revision: i64,
    pub(crate) sealed: SealedPayload,
}

pub(crate) fn read_sealed_rows(
    connection: &Connection,
    note_ids: Option<&[String]>,
) -> Result<Vec<SealedRow>, StorageError> {
    let filter = serde_json::to_string(&note_ids.unwrap_or(&[])).map_err(json_backend)?;
    let mut statement = connection
        .prepare_cached(
            "SELECT note_id, revision, sealed_body, sealed_nonce, sealed_key_id FROM documents \
             WHERE sealed_body IS NOT NULL \
             AND (?1 IS NULL OR note_id IN (SELECT value FROM json_each(?1))) \
             ORDER BY note_id",
        )
        .map_err(backend)?;
    let rows = statement
        .query_map(params![note_ids.map(|_| filter)], |row| {
            Ok(SealedRow {
                note_id: row.get(0)?,
                revision: row.get(1)?,
                sealed: SealedPayload {
                    scheme: SEAL_SCHEME_V2.into(),
                    key_id: row.get(4)?,
                    nonce: row.get(3)?,
                    ciphertext: encode_base64(&row.get::<_, Vec<u8>>(2)?),
                },
            })
        })
        .map_err(backend)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(backend)
}

/// Opens every sealed body into a plain document record.
pub(crate) fn open_locked_documents(
    connection: &Connection,
    key: &ContentKey,
    note_ids: Option<&[String]>,
) -> Result<Vec<WorkspaceDocument>, StorageError> {
    read_sealed_rows(connection, note_ids)?
        .into_iter()
        .map(|row| {
            let body = open_document(key, &row.note_id, &row.sealed)?;
            Ok(WorkspaceDocument {
                note_id: row.note_id,
                document_json: body.document_json,
                markdown: body.markdown,
                revision: row.revision,
                word_count: body.word_count,
                sealed: None,
            })
        })
        .collect()
}

pub(crate) fn sealed_row(
    connection: &Connection,
    note_id: &str,
) -> Result<Option<SealedRow>, StorageError> {
    Ok(read_sealed_rows(connection, Some(&[note_id.to_owned()]))?.pop())
}

/// The current plaintext body of a note, or `None` when it is stored sealed.
pub(crate) fn plaintext_body(
    connection: &Connection,
    note_id: &str,
) -> Result<Option<(LockedDocumentBody, i64)>, StorageError> {
    connection
        .query_row(
            "SELECT document_json, markdown, word_count, revision, sealed_body IS NOT NULL \
             FROM documents WHERE note_id = ?1",
            [note_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, bool>(4)?,
                ))
            },
        )
        .optional()
        .map_err(backend)?
        .map(|(json, markdown, word_count, revision, sealed)| {
            if sealed {
                return Ok(None);
            }
            let document_json = serde_json::from_str(&json).map_err(json_backend)?;
            Ok(Some((
                LockedDocumentBody {
                    document_json,
                    markdown,
                    word_count,
                },
                revision,
            )))
        })
        .transpose()
        .map(Option::flatten)
}

pub(crate) fn node_locked(connection: &Connection, id: &str) -> Result<bool, StorageError> {
    connection
        .query_row(
            "SELECT locked_at IS NOT NULL FROM workspace_nodes WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(backend)
        .map(|locked| locked.unwrap_or(false))
}

/// Whether the node or any ancestor is locked, so a note that lands under a
/// locked folder inherits the lock.
pub(crate) fn placement_locked(
    connection: &Connection,
    parent_id: Option<&str>,
) -> Result<bool, StorageError> {
    let Some(parent_id) = parent_id else {
        return Ok(false);
    };
    connection
        .query_row(
            "WITH RECURSIVE ancestors(id, parent_id, locked_at) AS (\
                 SELECT id, parent_id, locked_at FROM workspace_nodes WHERE id = ?1 \
                 UNION ALL \
                 SELECT parent.id, parent.parent_id, parent.locked_at \
                 FROM workspace_nodes parent JOIN ancestors ON parent.id = ancestors.parent_id\
             ) SELECT COALESCE(MAX(locked_at IS NOT NULL), 0) FROM ancestors",
            [parent_id],
            |row| row.get(0),
        )
        .map_err(backend)
}

/// The node itself plus every descendant, with kinds, in tree order.
pub(crate) fn subtree_nodes(
    connection: &Connection,
    root_id: &str,
) -> Result<Vec<(String, NodeKind)>, StorageError> {
    let mut statement = connection
        .prepare_cached(
            "WITH RECURSIVE subtree(id, depth) AS (\
                 SELECT id, 0 FROM workspace_nodes WHERE id = ?1 \
                 UNION ALL \
                 SELECT child.id, subtree.depth + 1 FROM workspace_nodes child \
                 JOIN subtree ON child.parent_id = subtree.id\
             ) SELECT subtree.id, nodes.kind FROM subtree \
             JOIN workspace_nodes nodes ON nodes.id = subtree.id \
             ORDER BY subtree.depth, subtree.id",
        )
        .map_err(backend)?;
    let rows = statement
        .query_map([root_id], |row| {
            let kind = match row.get::<_, String>(1)?.as_str() {
                "folder" => NodeKind::Folder,
                _ => NodeKind::Note,
            };
            Ok((row.get::<_, String>(0)?, kind))
        })
        .map_err(backend)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(backend)
}

pub(crate) fn subtree_note_ids(
    connection: &Connection,
    root_id: &str,
) -> Result<Vec<String>, StorageError> {
    Ok(subtree_nodes(connection, root_id)?
        .into_iter()
        .filter(|(_, kind)| *kind == NodeKind::Note)
        .map(|(id, _)| id)
        .collect())
}

fn key_required(action: &str) -> StorageError {
    StorageError::InvalidOperation(format!("Unlock your notes before you {action}."))
}

fn sealed_save(
    key: &ContentKey,
    note_id: &str,
    body: &LockedDocumentBody,
    expected_revision: i64,
    at: i64,
) -> Result<WorkspaceOperation, StorageError> {
    Ok(WorkspaceOperation::SaveSealedDocument {
        note_id: note_id.to_owned(),
        sealed: seal_document(key, note_id, body)?,
        expected_revision,
        at,
    })
}

/// Sealed saves for every note under `root_id` whose body is still plaintext,
/// so a lock request arrives at every device with the bodies it locks.
fn seal_subtree(
    connection: &Connection,
    key: Option<&ContentKey>,
    root_id: &str,
    at: i64,
) -> Result<Vec<WorkspaceOperation>, StorageError> {
    let mut operations = Vec::new();
    for note_id in subtree_note_ids(connection, root_id)? {
        let Some((body, revision)) = plaintext_body(connection, &note_id)? else {
            continue;
        };
        let key = key.ok_or_else(|| key_required("lock notes"))?;
        operations.push(sealed_save(key, &note_id, &body, revision, at)?);
    }
    Ok(operations)
}

/// Plaintext saves for every sealed note under `root_id`, so unlocking a note
/// permanently restores its body everywhere.
fn open_subtree(
    connection: &Connection,
    key: Option<&ContentKey>,
    root_id: &str,
    at: i64,
) -> Result<Vec<WorkspaceOperation>, StorageError> {
    let mut operations = Vec::new();
    for note_id in subtree_note_ids(connection, root_id)? {
        let Some(row) = sealed_row(connection, &note_id)? else {
            continue;
        };
        let key = key.ok_or_else(|| key_required("unlock notes"))?;
        let body = open_document(key, &note_id, &row.sealed)?;
        operations.push(WorkspaceOperation::SaveDocument {
            note_id,
            document_json: body.document_json,
            markdown: body.markdown,
            word_count: body.word_count,
            expected_revision: row.revision,
            at,
        });
    }
    Ok(operations)
}

fn lock_moved_subtree(
    connection: &Connection,
    key: Option<&ContentKey>,
    id: &str,
    placement: &NodePlacement,
    at: i64,
) -> Result<Vec<WorkspaceOperation>, StorageError> {
    if node_locked(connection, id)?
        || !placement_locked(connection, placement.parent_id.as_deref())?
    {
        return Ok(Vec::new());
    }
    let mut operations = seal_subtree(connection, key, id, at)?;
    operations.push(WorkspaceOperation::SetNodeLocked {
        id: id.to_owned(),
        locked: true,
        at,
    });
    Ok(operations)
}

/// Expands one renderer-submitted operation into the operations that keep
/// locked bodies sealed everywhere: lock requests gain sealed saves, unlock
/// requests gain plaintext saves, writes to locked notes become sealed writes,
/// and notes created in or moved under a locked folder inherit the lock.
/// Generated operations are final and are not expanded again.
pub(crate) fn expand_operation(
    connection: &Connection,
    envelope: &WorkspaceOperationEnvelope,
    key: Option<&ContentKey>,
) -> Result<Vec<WorkspaceOperationEnvelope>, StorageError> {
    let wrap = |operation: WorkspaceOperation| WorkspaceOperationEnvelope {
        protocol_version: envelope.protocol_version,
        operation,
    };
    let expanded = match &envelope.operation {
        WorkspaceOperation::SetNodeLocked {
            id,
            locked: true,
            at,
        } => {
            let mut operations = seal_subtree(connection, key, id, *at)?;
            operations.push(envelope.operation.clone());
            operations
        }
        WorkspaceOperation::SetNodeLocked {
            id,
            locked: false,
            at,
        } => {
            let mut operations = vec![envelope.operation.clone()];
            operations.extend(open_subtree(connection, key, id, *at)?);
            operations
        }
        WorkspaceOperation::SaveDocument {
            note_id,
            document_json,
            markdown,
            word_count,
            expected_revision,
            at,
        } if node_locked(connection, note_id)? => {
            let key = key.ok_or_else(|| key_required("edit a locked note"))?;
            let body = LockedDocumentBody {
                document_json: document_json.clone(),
                markdown: markdown.clone(),
                word_count: *word_count,
            };
            vec![sealed_save(key, note_id, &body, *expected_revision, *at)?]
        }
        WorkspaceOperation::CreateNote {
            id,
            title,
            placement,
            document_json,
            markdown,
            at,
        } if placement_locked(connection, placement.parent_id.as_deref())? => {
            let key = key.ok_or_else(|| key_required("add notes to a locked folder"))?;
            let body = LockedDocumentBody {
                document_json: document_json.clone(),
                markdown: markdown.clone(),
                word_count: skriuw_domain::count_words(markdown),
            };
            vec![
                WorkspaceOperation::CreateNote {
                    id: id.clone(),
                    title: title.clone(),
                    placement: placement.clone(),
                    document_json: locked_document_placeholder(),
                    markdown: String::new(),
                    at: *at,
                },
                sealed_save(key, id, &body, 1, *at)?,
                WorkspaceOperation::SetNodeLocked {
                    id: id.clone(),
                    locked: true,
                    at: *at,
                },
            ]
        }
        WorkspaceOperation::MoveNode { id, placement, at }
        | WorkspaceOperation::RestoreSubtree {
            root_id: id,
            placement,
            at,
        } => {
            let mut operations = vec![envelope.operation.clone()];
            operations.extend(lock_moved_subtree(connection, key, id, placement, *at)?);
            operations
        }
        _ => vec![envelope.operation.clone()],
    };
    Ok(expanded.into_iter().map(wrap).collect())
}

/// Stores a sealed body in place of the plaintext columns, leaving nothing of
/// the note in the search index, the reference graph, or the task index.
pub(crate) fn write_sealed_body(
    transaction: &Transaction<'_>,
    note_id: &str,
    sealed: &SealedPayload,
    next_revision: i64,
    expected_revision: i64,
) -> Result<usize, StorageError> {
    if sealed.scheme != NOTE_LOCK_SCHEME {
        return Err(StorageError::InvalidOperation(format!(
            "unsupported sealing scheme {}",
            sealed.scheme
        )));
    }
    let ciphertext = decode_base64(&sealed.ciphertext).map_err(crypto_error)?;
    transaction
        .execute(
            "UPDATE documents SET document_json = ?2, markdown = '', word_count = 0, revision = ?3, \
                 sealed_body = ?4, sealed_nonce = ?5, sealed_key_id = ?6 \
             WHERE note_id = ?1 AND revision = ?7",
            params![
                note_id,
                locked_document_placeholder().to_string(),
                next_revision,
                ciphertext,
                sealed.nonce,
                sealed.key_id,
                expected_revision
            ],
        )
        .map_err(backend)
}

/// Removes every plaintext trace a locked note left outside its body row.
pub(crate) fn scrub_note_projections(
    transaction: &Transaction<'_>,
    note_id: &str,
) -> Result<(), StorageError> {
    transaction
        .execute("DELETE FROM documents_fts WHERE note_id = ?1", [note_id])
        .map_err(backend)?;
    transaction
        .execute(
            "DELETE FROM document_references WHERE source_note_id = ?1",
            [note_id],
        )
        .map_err(backend)?;
    transaction
        .execute(
            "DELETE FROM workspace_tasks WHERE source_note_id = ?1",
            [note_id],
        )
        .map_err(backend)?;
    Ok(())
}

/// Drops pending history captures for a note that just locked, so its
/// plaintext never reaches the history repository from here on.
pub(crate) fn discard_pending_history(
    transaction: &Transaction<'_>,
    note_id: &str,
) -> Result<(), StorageError> {
    transaction
        .execute(
            "DELETE FROM history_outbox WHERE note_id = ?1 AND claimed_by IS NULL",
            [note_id],
        )
        .map_err(backend)?;
    Ok(())
}
