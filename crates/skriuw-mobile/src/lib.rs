//! The UniFFI facade the native mobile shell calls the shared Skriuw core
//! through (ADR-0048).
//!
//! The surface is deliberately narrow: open a workspace at a caller-supplied
//! directory, read the bootstrap snapshot, submit workspace operations, and
//! load or save one document. Payloads cross the boundary as the existing
//! generated-contract JSON, so the mobile client consumes the same schema the
//! desktop and browser runtimes do and no second contract exists.
//!
//! Everything durable stays behind `skriuw-runtime`'s single owner thread, and
//! every exported call is wrapped so a panic becomes a typed error rather than
//! unwinding into JNI or the Swift runtime.

mod boundary;
mod error;
mod workspace;

pub use error::MobileError;
pub use workspace::{MobileWorkspace, SaveDocumentRequest, workspace_protocol_version};

uniffi::setup_scaffolding!();
