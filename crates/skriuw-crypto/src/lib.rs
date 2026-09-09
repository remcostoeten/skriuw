//! Client-side content sealing for workspace sync.
//!
//! The crate owns exactly three things: the recovery code that is the root
//! secret of an encrypted workspace, the Argon2id derivation that turns it
//! into a workspace content key, and the XChaCha20-Poly1305 sealing of
//! arbitrary byte content under that key. It has no database, filesystem,
//! network, clock, or random-number dependency, so it compiles unchanged for
//! `wasm32-unknown-unknown` and stays deterministic under test.
//!
//! Nonces are derived, never random: a nonce is a domain-separated hash of
//! the key identity, the caller's context string, and the digest of the
//! plaintext. Sealing the same bytes in the same slot twice therefore
//! reproduces the same ciphertext, and two different plaintexts never share a
//! nonce. The threat model and what that determinism reveals are documented
//! in `docs/adr/0041-end-to-end-encrypted-sync.md`.

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine, engine::general_purpose::STANDARD_NO_PAD};
use chacha20poly1305::{
    Key, KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, Payload},
};
use sha2::{Digest, Sha256};
use thiserror::Error;
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Wire identifier of the sealing scheme. It names the KDF, the AEAD, and the
/// nonce derivation together, so a future scheme is a new identifier rather
/// than a silent reinterpretation of the same bytes.
pub const SEAL_SCHEME_V1: &str = "argon2id-xchacha20poly1305-v1";

pub const CONTENT_KEY_BYTES: usize = 32;
pub const RECOVERY_CODE_ENTROPY_BYTES: usize = 20;
pub const RECOVERY_CODE_CHARACTERS: usize = 32;
pub const KEY_ID_HEX_CHARACTERS: usize = 16;

const NONCE_BYTES: usize = 24;
const SALT_BYTES: usize = 16;
const KDF_MEMORY_KIB: u32 = 19_456;
const KDF_ITERATIONS: u32 = 2;
const KDF_PARALLELISM: u32 = 1;
const SALT_DOMAIN: &str = "skriuw-sync-e2ee-salt-v1";
const KEY_ID_DOMAIN: &str = "skriuw-sync-e2ee-key-id-v1";
const NONCE_DOMAIN: &str = "skriuw-sync-e2ee-nonce-v1";
const CROCKFORD_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_CODE_GROUP: usize = 4;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum CryptoError {
    #[error(
        "the recovery code is not a Skriuw recovery code: it must be {RECOVERY_CODE_CHARACTERS} letters and digits, in groups of four"
    )]
    MalformedRecoveryCode,
    #[error("a recovery code needs exactly {RECOVERY_CODE_ENTROPY_BYTES} bytes of entropy")]
    InsufficientEntropy,
    #[error("the workspace encryption key could not be derived: {0}")]
    KeyDerivation(String),
    #[error("sealed content is not valid base64")]
    MalformedSealedContent,
    #[error("sealed content carries a {actual}-byte nonce instead of {NONCE_BYTES}")]
    MalformedNonce { actual: usize },
    #[error("sealed content names key {expected} but this device holds key {actual}")]
    WrongKey { expected: String, actual: String },
    #[error("sealed content names the unsupported scheme {0}")]
    UnsupportedScheme(String),
    #[error(
        "sealed content could not be opened: it was changed after it was sealed, or it belongs to a different recovery code"
    )]
    ContentUnopenable,
    #[error("content could not be sealed")]
    ContentUnsealable,
}

/// The root secret of an encrypted workspace. It is shown once, never leaves
/// a device except as the user copies it, and is the only way to derive the
/// content key on a second device.
#[derive(Clone, PartialEq, Eq, Zeroize, ZeroizeOnDrop)]
pub struct RecoveryCode {
    entropy: [u8; RECOVERY_CODE_ENTROPY_BYTES],
}

impl core::fmt::Debug for RecoveryCode {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        formatter.write_str("RecoveryCode(redacted)")
    }
}

impl RecoveryCode {
    /// Builds a recovery code from caller-supplied cryptographic entropy. The
    /// crate deliberately owns no random-number generator: the runtime that
    /// enables encryption supplies platform randomness (`getrandom` on the
    /// desktop, `crypto.getRandomValues` in the browser).
    pub fn from_entropy(entropy: &[u8]) -> Result<Self, CryptoError> {
        let entropy: [u8; RECOVERY_CODE_ENTROPY_BYTES] = entropy
            .try_into()
            .map_err(|_| CryptoError::InsufficientEntropy)?;
        Ok(Self { entropy })
    }

    /// Parses a code the user typed. Grouping, case, whitespace, and the
    /// Crockford confusables (`I`, `L` for `1`, `O` for `0`) are all accepted.
    pub fn parse(value: &str) -> Result<Self, CryptoError> {
        let mut symbols = Vec::with_capacity(RECOVERY_CODE_CHARACTERS);
        for character in value.chars() {
            if character.is_whitespace() || character == '-' {
                continue;
            }
            symbols.push(crockford_value(character)?);
        }
        if symbols.len() != RECOVERY_CODE_CHARACTERS {
            return Err(CryptoError::MalformedRecoveryCode);
        }
        let mut entropy = [0_u8; RECOVERY_CODE_ENTROPY_BYTES];
        for (index, chunk) in symbols.chunks(8).enumerate() {
            let mut block = 0_u64;
            for symbol in chunk {
                block = (block << 5) | u64::from(*symbol);
            }
            let offset = index * 5;
            for byte in 0..5 {
                entropy[offset + byte] = ((block >> (32 - byte * 8)) & 0xff) as u8;
            }
        }
        Ok(Self { entropy })
    }

    /// The user-facing form: eight groups of four Crockford base32 symbols.
    #[must_use]
    pub fn formatted(&self) -> String {
        let mut symbols = String::with_capacity(RECOVERY_CODE_CHARACTERS);
        for chunk in self.entropy.chunks(5) {
            let mut block = 0_u64;
            for byte in chunk {
                block = (block << 8) | u64::from(*byte);
            }
            for index in 0..8 {
                let symbol = ((block >> (35 - index * 5)) & 0x1f) as usize;
                symbols.push(char::from(CROCKFORD_ALPHABET[symbol]));
            }
        }
        symbols
            .as_bytes()
            .chunks(RECOVERY_CODE_GROUP)
            .map(|group| String::from_utf8_lossy(group).into_owned())
            .collect::<Vec<_>>()
            .join("-")
    }
}

/// The symmetric key every sealed byte of one workspace is encrypted under.
/// It is derived from the recovery code and the workspace identity, so no
/// wrapped copy of it ever has to travel to the server.
#[derive(Clone, PartialEq, Eq, Zeroize, ZeroizeOnDrop)]
pub struct ContentKey {
    material: [u8; CONTENT_KEY_BYTES],
}

impl core::fmt::Debug for ContentKey {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        formatter
            .debug_struct("ContentKey")
            .field("key_id", &self.key_id())
            .finish()
    }
}

impl ContentKey {
    /// Restores a key from device-local storage. The bytes are device-local
    /// material, never wire material.
    pub fn from_material(material: &[u8]) -> Result<Self, CryptoError> {
        let material: [u8; CONTENT_KEY_BYTES] = material
            .try_into()
            .map_err(|_| CryptoError::InsufficientEntropy)?;
        Ok(Self { material })
    }

    #[must_use]
    pub fn material(&self) -> &[u8; CONTENT_KEY_BYTES] {
        &self.material
    }

    /// Public, non-secret identity of the key. Sealed content names it so a
    /// device holding the wrong recovery code fails with an actionable error
    /// instead of an authentication-tag failure.
    #[must_use]
    pub fn key_id(&self) -> String {
        let digest = Sha256::new()
            .chain_update(KEY_ID_DOMAIN.as_bytes())
            .chain_update(self.material)
            .finalize();
        digest
            .iter()
            .take(KEY_ID_HEX_CHARACTERS / 2)
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }
}

/// Derives the workspace content key from the recovery code. The salt is a
/// domain-separated hash of the workspace identity, so a second device that
/// knows the workspace it just provisioned needs nothing but the code.
pub fn derive_content_key(
    recovery_code: &RecoveryCode,
    workspace_id: &str,
) -> Result<ContentKey, CryptoError> {
    let salt = Sha256::new()
        .chain_update(SALT_DOMAIN.as_bytes())
        .chain_update(workspace_id.as_bytes())
        .finalize();
    let params = Params::new(KDF_MEMORY_KIB, KDF_ITERATIONS, KDF_PARALLELISM, None)
        .map_err(|error| CryptoError::KeyDerivation(error.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut material = [0_u8; CONTENT_KEY_BYTES];
    argon
        .hash_password_into(&recovery_code.entropy, &salt[..SALT_BYTES], &mut material)
        .map_err(|error| CryptoError::KeyDerivation(error.to_string()))?;
    let key = ContentKey { material };
    material.zeroize();
    Ok(key)
}

/// One sealed blob: the derived nonce and the AEAD ciphertext, both base64.
/// The caller decides whether the ciphertext travels inline or as chunked
/// content; this type never grows transport concerns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SealedBytes {
    pub nonce: String,
    pub ciphertext: Vec<u8>,
}

impl SealedBytes {
    #[must_use]
    pub fn ciphertext_base64(&self) -> String {
        STANDARD_NO_PAD.encode(&self.ciphertext)
    }
}

/// Seals `plaintext` under `key`, binding it to `context` so a sealed
/// operation cannot be replayed into a different slot of the protocol.
pub fn seal(key: &ContentKey, context: &str, plaintext: &[u8]) -> Result<SealedBytes, CryptoError> {
    let nonce = derive_nonce(key, context, plaintext);
    let cipher = XChaCha20Poly1305::new(&Key::from(key.material));
    let ciphertext = cipher
        .encrypt(
            &XNonce::from(nonce),
            Payload {
                msg: plaintext,
                aad: context.as_bytes(),
            },
        )
        .map_err(|_| CryptoError::ContentUnsealable)?;
    Ok(SealedBytes {
        nonce: STANDARD_NO_PAD.encode(nonce),
        ciphertext,
    })
}

/// Opens sealed bytes, failing loudly and distinguishably when the device
/// holds the wrong key, when the scheme is unknown, and when the content was
/// changed after it was sealed.
pub fn open(
    key: &ContentKey,
    scheme: &str,
    key_id: &str,
    context: &str,
    nonce: &str,
    ciphertext: &[u8],
) -> Result<Vec<u8>, CryptoError> {
    if scheme != SEAL_SCHEME_V1 {
        return Err(CryptoError::UnsupportedScheme(scheme.to_string()));
    }
    let held = key.key_id();
    if key_id != held {
        return Err(CryptoError::WrongKey {
            expected: key_id.to_string(),
            actual: held,
        });
    }
    let nonce = decode_base64(nonce)?;
    let nonce: [u8; NONCE_BYTES] =
        nonce
            .as_slice()
            .try_into()
            .map_err(|_| CryptoError::MalformedNonce {
                actual: nonce.len(),
            })?;
    let cipher = XChaCha20Poly1305::new(&Key::from(key.material));
    cipher
        .decrypt(
            &XNonce::from(nonce),
            Payload {
                msg: ciphertext,
                aad: context.as_bytes(),
            },
        )
        .map_err(|_| CryptoError::ContentUnopenable)
}

pub fn decode_base64(value: &str) -> Result<Vec<u8>, CryptoError> {
    STANDARD_NO_PAD
        .decode(value)
        .map_err(|_| CryptoError::MalformedSealedContent)
}

#[must_use]
pub fn encode_base64(bytes: &[u8]) -> String {
    STANDARD_NO_PAD.encode(bytes)
}

fn derive_nonce(key: &ContentKey, context: &str, plaintext: &[u8]) -> [u8; NONCE_BYTES] {
    let digest = Sha256::new()
        .chain_update(NONCE_DOMAIN.as_bytes())
        .chain_update(key.key_id().as_bytes())
        .chain_update((context.len() as u64).to_be_bytes())
        .chain_update(context.as_bytes())
        .chain_update(Sha256::digest(plaintext))
        .finalize();
    let mut nonce = [0_u8; NONCE_BYTES];
    nonce.copy_from_slice(&digest[..NONCE_BYTES]);
    nonce
}

fn crockford_value(character: char) -> Result<u8, CryptoError> {
    let upper = character.to_ascii_uppercase();
    let normalized = match upper {
        'I' | 'L' => '1',
        'O' => '0',
        other => other,
    };
    CROCKFORD_ALPHABET
        .iter()
        .position(|symbol| char::from(*symbol) == normalized)
        .map(|position| position as u8)
        .ok_or(CryptoError::MalformedRecoveryCode)
}

#[cfg(test)]
mod tests {
    use super::{
        ContentKey, CryptoError, RECOVERY_CODE_ENTROPY_BYTES, RecoveryCode, SEAL_SCHEME_V1,
        derive_content_key, open, seal,
    };

    fn recovery_code(seed: u8) -> RecoveryCode {
        RecoveryCode::from_entropy(&[seed; RECOVERY_CODE_ENTROPY_BYTES]).expect("entropy")
    }

    fn key(seed: u8) -> ContentKey {
        derive_content_key(&recovery_code(seed), "workspace-1").expect("derive")
    }

    #[test]
    fn recovery_codes_round_trip_through_their_user_facing_form() {
        let code = RecoveryCode::from_entropy(&[
            0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd,
            0xee, 0xff, 0x01, 0x23, 0x45, 0x67,
        ])
        .expect("entropy");
        let formatted = code.formatted();
        assert_eq!(formatted.len(), 39);
        assert_eq!(formatted.matches('-').count(), 7);
        assert_eq!(RecoveryCode::parse(&formatted), Ok(code.clone()));
        assert_eq!(
            RecoveryCode::parse(&formatted.to_lowercase().replace('-', " ")),
            Ok(code)
        );
    }

    #[test]
    fn malformed_recovery_codes_are_named_as_such() {
        assert_eq!(
            RecoveryCode::parse("too-short"),
            Err(CryptoError::MalformedRecoveryCode)
        );
        assert_eq!(
            RecoveryCode::parse(&"U".repeat(32)),
            Err(CryptoError::MalformedRecoveryCode)
        );
        assert_eq!(
            RecoveryCode::from_entropy(&[1, 2, 3]),
            Err(CryptoError::InsufficientEntropy)
        );
    }

    #[test]
    fn the_same_code_and_workspace_derive_the_same_key_and_others_do_not() {
        let first = key(7);
        assert_eq!(first.material(), key(7).material());
        assert_ne!(first.material(), key(8).material());
        let other_workspace =
            derive_content_key(&recovery_code(7), "workspace-2").expect("derive other workspace");
        assert_ne!(first.material(), other_workspace.material());
        assert_ne!(first.key_id(), other_workspace.key_id());
        assert_eq!(first.key_id().len(), 16);
    }

    #[test]
    fn sealed_content_round_trips_and_hides_the_plaintext() {
        let key = key(3);
        let sealed = seal(&key, "operation:op-1", b"secret note body").expect("seal");
        assert!(
            !sealed
                .ciphertext
                .windows(6)
                .any(|window| window == b"secret")
        );
        let opened = open(
            &key,
            SEAL_SCHEME_V1,
            &key.key_id(),
            "operation:op-1",
            &sealed.nonce,
            &sealed.ciphertext,
        )
        .expect("open");
        assert_eq!(opened, b"secret note body");
    }

    #[test]
    fn wrong_key_tampering_and_slot_confusion_all_fail_loudly() {
        let key = key(3);
        let sealed = seal(&key, "operation:op-1", b"secret note body").expect("seal");
        let other = key_from_other_code();
        assert!(matches!(
            open(
                &other,
                SEAL_SCHEME_V1,
                &key.key_id(),
                "operation:op-1",
                &sealed.nonce,
                &sealed.ciphertext,
            ),
            Err(CryptoError::WrongKey { .. })
        ));

        let mut tampered = sealed.ciphertext.clone();
        tampered[0] ^= 0x01;
        assert_eq!(
            open(
                &key,
                SEAL_SCHEME_V1,
                &key.key_id(),
                "operation:op-1",
                &sealed.nonce,
                &tampered,
            ),
            Err(CryptoError::ContentUnopenable)
        );

        assert_eq!(
            open(
                &key,
                SEAL_SCHEME_V1,
                &key.key_id(),
                "operation:op-2",
                &sealed.nonce,
                &sealed.ciphertext,
            ),
            Err(CryptoError::ContentUnopenable)
        );

        assert_eq!(
            open(
                &key,
                "argon2id-aes-gcm-v9",
                &key.key_id(),
                "operation:op-1",
                &sealed.nonce,
                &sealed.ciphertext,
            ),
            Err(CryptoError::UnsupportedScheme("argon2id-aes-gcm-v9".into()))
        );
    }

    #[test]
    fn distinct_plaintexts_never_share_a_nonce() {
        let key = key(5);
        let first = seal(&key, "operation:op-1", b"one").expect("seal");
        let second = seal(&key, "operation:op-1", b"two").expect("seal");
        assert_ne!(first.nonce, second.nonce);
        let repeated = seal(&key, "operation:op-1", b"one").expect("seal");
        assert_eq!(first.nonce, repeated.nonce);
        assert_eq!(first.ciphertext, repeated.ciphertext);
    }

    fn key_from_other_code() -> ContentKey {
        derive_content_key(&recovery_code(9), "workspace-1").expect("derive")
    }
}
