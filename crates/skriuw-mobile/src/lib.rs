//! The UniFFI facade the native mobile shell calls the shared Skriuw core
//! through (ADR-0048).
//!
//! The surface is deliberately narrow: open a workspace at a caller-supplied
//! directory, read the bootstrap snapshot, submit workspace operations, load
//! or save one document, route an account to its own local workspace, and run
//! replication for the open one. Payloads cross the boundary as the existing
//! generated-contract JSON, so the mobile client consumes the same schema the
//! desktop and browser runtimes do and no second contract exists.
//!
//! Everything durable stays behind `skriuw-runtime`'s single owner thread, and
//! every exported call is wrapped so a panic becomes a typed error rather than
//! unwinding into JNI or the Swift runtime. Networking is a foreign port, so
//! the core links no HTTP client, TLS stack or certificate roots;
//! `tests/dependencies.rs` holds that boundary.

mod boundary;
mod error;
mod slots;
mod sync;
mod workspace;

pub use error::MobileError;
pub use slots::{
    SlotAdoption, WorkspaceRoute, active_workspace_directory, active_workspace_slot,
    adopt_workspace_slot,
};
pub use sync::{
    MobileAssetStore, MobileSync, MobileSyncNetwork, MobileSyncObserver, SyncRequest, SyncResponse,
};
pub use workspace::{MobileWorkspace, SaveDocumentRequest, workspace_protocol_version};

uniffi::setup_scaffolding!();
